"""
Otomasyon koşumu WebSocket'i: /ws/run-test?token=...

İstemci → sunucu:
  1. {"cases": [id...], "browser": "Chrome", "headless": true, "environment_id": 3?}
  2. (isteğe bağlı) {"type": "stop"} — süreç sonlandırılır, koşum kaydedilmez
Sunucu → istemci:
  {"type": "info|warn|error|success|running", "message", "progress"?}   log satırı
  {"type": "plan", "cases": [{case_id, title, status: queued|skipped, reason?}]}
  {"type": "case", "case_id", "status": running|passed|failed|skipped}
  {"type": "summary", "run_id", "defect", "results": [...], "counts": {...}, "duration"}
  {"type": "stopped", "message"} | {"type": "done", "message"}
Bağlantı koparsa süreç de sonlandırılır (arka planda sahipsiz koşum kalmaz).
"""
import asyncio
import logging
import threading
import os
import shutil
import subprocess
import sys
import tempfile
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.deps import has_permission, user_from_token
from app.db.database import SessionLocal
from . import runner

logger = logging.getLogger("ng-test.automation")
router = APIRouter()

_active = 0                     # süren koşum sayısı (süreç başına)
_lock = threading.Lock()


async def send(ws: WebSocket, type_: str, message: str = "", **extra):
    try:
        await ws.send_json({"type": type_, "message": message, **extra})
    except Exception:
        pass


def classify(line: str) -> str:
    upper = line.upper()
    if runner.STATUS_RE.search(line):
        word = runner.STATUS_RE.search(line).group(1)
        return {"PASSED": "success", "XPASS": "success", "FAILED": "error", "ERROR": "error"}.get(word, "warn")
    if any(k in upper for k in ("TRACEBACK", "ASSERTIONERROR", "EXCEPTION", " ERROR ", "E   ")):
        return "error"
    if any(k in upper for k in ("WARNING", "SKIPPED", "XFAIL")):
        return "warn"
    if any(k in upper for k in ("COLLECTING", "COLLECTED", "SESSION STARTS", "PLATFORM ")):
        return "running"
    return "info"


async def _watch_client(ws: WebSocket, stop: asyncio.Event):
    """Koşum sürerken istemciyi dinler: 'stop' mesajı ya da bağlantı kopması koşumu durdurur."""
    try:
        while True:
            msg = await ws.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "stop":
                stop.set()
                return
    except Exception:          # WebSocketDisconnect dahil
        stop.set()


def _load(config: dict):
    """Veritabanından case'leri, ortamı ve çözümlenmiş değişkenleri okur."""
    from app.modules.test_cases.models import TestCase
    from app.modules.environments.models import Environment
    from app.modules.environments.service import resolve_variables

    ids = [int(c) for c in (config.get("cases") or config.get("test_case_ids") or [])]
    db = SessionLocal()
    try:
        found = {tc.id: tc for tc in db.query(TestCase).filter(TestCase.id.in_(ids)).all()} if ids else {}
        cases = [found[i] for i in dict.fromkeys(ids) if i in found]
        missing = [i for i in ids if i not in found]
        env = None
        env_id = config.get("environment_id")
        if env_id:
            row = db.query(Environment).filter(Environment.id == int(env_id)).first()
            if row is None:
                raise ValueError("Seçilen ortam bulunamadı.")
            env = {"name": row.name, "url": row.url, "project_id": row.project_id,
                   "vars": {r["key"]: r["value"] for r in resolve_variables(db, row)},
                   "secrets": [r["value"] for r in resolve_variables(db, row) if r["is_secret"] and len(r["value"]) >= 4]}
        for tc in cases:
            db.expunge(tc)
        return cases, missing, env
    finally:
        db.close()


@router.websocket("/ws/run-test")
async def run_test(websocket: WebSocket):
    global _active
    await websocket.accept()

    db = SessionLocal()
    try:
        user = user_from_token(db, websocket.query_params.get("token"))
        allowed = bool(user) and has_permission(db, user, "automation.execute")
        user_id = user.id if user else None
    finally:
        db.close()
    if not user:
        await send(websocket, "error", "[HATA] Oturum geçersiz. Lütfen tekrar giriş yapın.")
        await websocket.close(code=4401)
        return
    if not allowed:
        await send(websocket, "error", "[HATA] Otomasyon çalıştırma yetkiniz yok (automation.execute).")
        await websocket.close(code=4403)
        return

    process = None
    run_dir = None
    log_file = None
    watcher = None
    counted = False
    try:
        try:
            config = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
        except asyncio.TimeoutError:
            await send(websocket, "error", "[HATA] Koşum ayarları 30 saniye içinde gelmedi.")
            return
        except Exception as e:
            await send(websocket, "error", f"[HATA] Geçersiz istek: {e}")
            return

        try:
            cases, missing, env = await asyncio.to_thread(_load, config)
        except (TypeError, ValueError) as e:
            await send(websocket, "error", f"[HATA] {e}" if str(e) else "[HATA] Geçersiz test case ID formatı.")
            return
        if not cases:
            await send(websocket, "error", "[HATA] Çalıştırılacak test case bulunamadı.")
            return
        project_ids = {tc.project_id for tc in cases}
        if len(project_ids) > 1:
            await send(websocket, "error", "[HATA] Seçilen case'ler tek bir projeye ait olmalı.")
            return
        project_id = project_ids.pop()
        if env and env["project_id"] not in (None, project_id):
            await send(websocket, "error", "[HATA] Seçilen ortam bu projeye ait değil.")
            return

        with _lock:
            busy = _active >= runner.MAX_PARALLEL
            if not busy:
                _active += 1
                counted = True
        if busy:
            await send(websocket, "error", f"[HATA] Şu an {runner.MAX_PARALLEL} otomasyon koşumu sürüyor; biri bitince tekrar deneyin.")
            return

        secrets = env["secrets"] if env else []

        def redact(text: str) -> str:
            for sec in secrets:
                text = text.replace(sec, "••••••••")
            return text

        browser = config.get("browser", "Chrome")
        headless = bool(config.get("headless", True))
        for mid in missing:
            await send(websocket, "warn", f"[UYARI] #{mid} numaralı case bulunamadı (silinmiş olabilir).")
        if env:
            await send(websocket, "info", f"[SİSTEM] Ortam: {env['name']} ({env['url']}) · {len(env['vars'])} değişken yüklendi.")

        run_dir = tempfile.mkdtemp(prefix=runner.RUN_DIR_PREFIX)
        ready, skipped = runner.prepare_files(cases, run_dir)
        await send(websocket, "plan", f"{len(ready)} test koşulacak" + (f", {len(skipped)} atlandı" if skipped else ""),
                   cases=[{"case_id": r["case_id"], "title": r["title"], "status": "queued"} for r in ready]
                         + [{"case_id": s["case_id"], "title": s["title"], "status": "skipped", "reason": s["reason"]} for s in skipped])
        for s in skipped:
            await send(websocket, "warn", f"[UYARI] TC-{s['case_id']} '{s['title']}': {s['reason']}, atlanıyor.")
        if not ready:
            await send(websocket, "error", "[HATA] Otomasyon script'i olan test bulunamadı.")
            return

        junit_path = os.path.join(run_dir, "junit.xml")
        cmd = runner.build_command(sys.executable, run_dir, [r["file"] for r in ready], browser, headless,
                                   env["url"] if env else None, junit_path)
        proc_env = os.environ.copy()
        if env:
            proc_env.update(env["vars"])
            proc_env["NG_ENVIRONMENT"] = env["name"]
        proc_env["PYTHONUNBUFFERED"] = "1"

        log_path = os.path.join(run_dir, "execution.log")
        try:
            log_file = open(log_path, "w", encoding="utf-8")
            process = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                       env=proc_env, cwd=run_dir)
        except FileNotFoundError:
            await send(websocket, "error", "[KRİTİK] pytest veya playwright bulunamadı. Backend ortamını kontrol edin.")
            return
        await send(websocket, "running", f"[SİSTEM] {len(ready)} test başlatıldı · {browser}{'' if headless else ' (görünür)'}")

        stop = asyncio.Event()
        watcher = asyncio.create_task(_watch_client(websocket, stop))
        tracker = runner.LiveTracker([r["case_id"] for r in ready])
        tail: list[str] = []
        started = time.monotonic()
        timed_out = False

        with open(log_path, "r", encoding="utf-8", errors="replace") as reader:
            while True:
                if stop.is_set():
                    break
                if time.monotonic() - started > runner.TIMEOUT_SEC:
                    timed_out = True
                    break
                pos = reader.tell()
                line = reader.readline()
                if line and not line.endswith("\n") and process.poll() is None:
                    reader.seek(pos)            # satır henüz yazılıyor; tamamlanınca oku
                    await asyncio.sleep(0.05)
                    continue
                if not line:
                    if process.poll() is not None:
                        rest = reader.read()
                        lines = rest.splitlines()
                    else:
                        await asyncio.sleep(0.05)
                        continue
                else:
                    lines = [line]
                for raw in lines:
                    text = redact(raw.rstrip())
                    if not text.strip():
                        continue
                    tail.append(text)
                    del tail[:-200]
                    changes = tracker.feed(text)
                    progress = min(99, int(tracker.finished / len(ready) * 100))
                    await send(websocket, classify(text), text, progress=progress)
                    for cid, st in changes:
                        await send(websocket, "case", case_id=cid, status=st, progress=progress)
                if not line:
                    break

        if stop.is_set() or timed_out:
            process.kill()
            await asyncio.to_thread(process.wait, 10)
        else:
            try:
                await asyncio.to_thread(process.wait, 10)
            except subprocess.TimeoutExpired:
                process.kill()

        if stop.is_set():
            await send(websocket, "stopped", "[SİSTEM] Koşum durduruldu; sonuçlar kaydedilmedi.")
            return
        if timed_out:
            await send(websocket, "error", f"[HATA] Koşum {runner.TIMEOUT_SEC} saniyede bitmedi ve sonlandırıldı.")

        junit = runner.parse_junit(junit_path, redact)
        results = runner.merge_results(ready, skipped, junit, tracker.state, tail,
                                       process_failed=(process.returncode not in (0, None)), timed_out=timed_out)
        duration = round(time.monotonic() - started, 1)
        meta = {"browser": browser, "headless": headless, "environment": env["name"] if env else None,
                "duration": duration, "skipped": [s["case_id"] for s in skipped]}

        def _save():
            db = SessionLocal()
            try:
                return runner.save_run(db, project_id=project_id, results=results, user_id=user_id,
                                       meta=meta, env_name=env["name"] if env else None)
            except Exception as e:
                logger.error(f"Otomasyon koşumu kaydedilemedi: {e}", exc_info=True)
                db.rollback()
                return None, None
            finally:
                db.close()

        run_id, defect = await asyncio.to_thread(_save)
        counts = {k: sum(r["status"] == v for r in results) for k, v in (("passed", "Passed"), ("failed", "Failed"), ("skipped", "Skipped"))}
        for r in results:   # canlı çıktıda görünmeyenler dahil son durumlar
            await send(websocket, "case", case_id=r["case_id"], status=r["status"].lower(), duration=r.get("duration"),
                       error=r["actual_result"] if r["status"] == "Failed" else None)
        if run_id is None:
            await send(websocket, "warn", "[UYARI] Koşum sonucu veritabanına kaydedilemedi.")
        else:
            await send(websocket, "info", f"[SİSTEM] Koşum kaydedildi: KS-{run_id}.")
            if defect:
                await send(websocket, "error", f"[SİSTEM] {counts['failed']} test kaldı; {defect} hata kaydı güncellendi.")
        await send(websocket, "summary", run_id=run_id, defect=defect, counts=counts, duration=duration, progress=100)
        await send(websocket, "done", "[SİSTEM] Koşum tamamlandı. Geçici dosyalar silindi.")

    except WebSocketDisconnect:
        logger.info("İstemci bağlantıyı kesti.")
    except Exception as e:
        logger.error(f"Otomasyon WebSocket hatası: {e}", exc_info=True)
        await send(websocket, "error", f"[SİSTEM HATASI] {e}")
    finally:
        if watcher and not watcher.done():
            watcher.cancel()
        if log_file is not None and not log_file.closed:
            log_file.close()
        if process and process.poll() is None:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass
        if run_dir:
            shutil.rmtree(run_dir, ignore_errors=True)
        if counted:
            with _lock:
                _active -= 1
