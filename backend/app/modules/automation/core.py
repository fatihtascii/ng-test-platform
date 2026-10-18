"""
Otomasyon koşumunun çekirdeği — taşıma katmanından bağımsız.

`execute(config, user_id, emit, stop)`:
  config: {"cases": [id...], "browser", "headless", "environment_id"}
  emit:   async (type, message="", **extra) — WebSocket'e gönderir ya da yalnızca günlüğe yazar
  stop:   asyncio.Event — kurulursa süreç sonlandırılır, koşum kaydedilmez
Dönüş: {"run_id", "defect", "counts", "duration"} ya da None (koşum başlamadı/durduruldu).

Kullananlar: WebSocket (router.py), CI uç noktası ve GitHub webhook'u (trigger.py).
"""
import asyncio
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from typing import Awaitable, Callable, Optional

from app.db.database import SessionLocal
from . import runner

logger = logging.getLogger("ng-test.automation")

Emit = Callable[..., Awaitable[None]]

_active = 0                     # süren koşum sayısı (süreç başına)
_lock = threading.Lock()


class StartError(Exception):
    """Koşum başlatılamadı (geçersiz istek, sınır, eksik script…)."""


def classify(line: str) -> str:
    upper = line.upper()
    m = runner.STATUS_RE.search(line)
    if m:
        return {"PASSED": "success", "XPASS": "success", "FAILED": "error", "ERROR": "error"}.get(m.group(1), "warn")
    if any(k in upper for k in ("TRACEBACK", "ASSERTIONERROR", "EXCEPTION", " ERROR ", "E   ")):
        return "error"
    if any(k in upper for k in ("WARNING", "SKIPPED", "XFAIL")):
        return "warn"
    if any(k in upper for k in ("COLLECTING", "COLLECTED", "SESSION STARTS", "PLATFORM ")):
        return "running"
    return "info"


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
                raise StartError("Seçilen ortam bulunamadı.")
            resolved = resolve_variables(db, row)
            env = {"name": row.name, "url": row.url, "project_id": row.project_id,
                   "vars": {r["key"]: r["value"] for r in resolved},
                   "secrets": [r["value"] for r in resolved if r["is_secret"] and len(r["value"]) >= 4]}
        for tc in cases:
            db.expunge(tc)
        return cases, missing, env
    finally:
        db.close()


def _acquire() -> bool:
    global _active
    with _lock:
        if _active >= runner.MAX_PARALLEL:
            return False
        _active += 1
        return True


def _release():
    global _active
    with _lock:
        _active -= 1


async def execute(config: dict, user_id: Optional[int], emit: Emit, stop: asyncio.Event,
                  trigger: Optional[dict] = None) -> Optional[dict]:
    """Koşumu yürütür. Başlatılamazsa StartError fırlatır."""
    try:
        cases, missing, env = await asyncio.to_thread(_load, config)
    except (TypeError, ValueError):
        raise StartError("Geçersiz test case ID formatı.")
    if not cases:
        raise StartError("Çalıştırılacak test case bulunamadı.")
    project_ids = {tc.project_id for tc in cases}
    if len(project_ids) > 1:
        raise StartError("Seçilen case'ler tek bir projeye ait olmalı.")
    project_id = project_ids.pop()
    if env and env["project_id"] not in (None, project_id):
        raise StartError("Seçilen ortam bu projeye ait değil.")
    if not _acquire():
        raise StartError(f"Şu an {runner.MAX_PARALLEL} otomasyon koşumu sürüyor; biri bitince tekrar deneyin.")

    process = None
    run_dir = None
    log_file = None
    try:
        secrets = env["secrets"] if env else []

        def redact(text: str) -> str:
            for sec in secrets:
                text = text.replace(sec, "••••••••")
            return text

        browser = config.get("browser", "Chrome")
        headless = bool(config.get("headless", True))
        for mid in missing:
            await emit("warn", f"[UYARI] #{mid} numaralı case bulunamadı (silinmiş olabilir).")
        if env:
            await emit("info", f"[SİSTEM] Ortam: {env['name']} ({env['url']}) · {len(env['vars'])} değişken yüklendi.")

        run_dir = tempfile.mkdtemp(prefix=runner.RUN_DIR_PREFIX)
        ready, skipped = runner.prepare_files(cases, run_dir)
        await emit("plan", f"{len(ready)} test koşulacak" + (f", {len(skipped)} atlandı" if skipped else ""),
                   cases=[{"case_id": r["case_id"], "title": r["title"], "status": "queued"} for r in ready]
                         + [{"case_id": s["case_id"], "title": s["title"], "status": "skipped", "reason": s["reason"]} for s in skipped])
        for s in skipped:
            await emit("warn", f"[UYARI] TC-{s['case_id']} '{s['title']}': {s['reason']}, atlanıyor.")
        if not ready:
            raise StartError("Otomasyon script'i olan test bulunamadı.")

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
            raise StartError("pytest veya playwright bulunamadı. Backend ortamını kontrol edin.")
        await emit("running", f"[SİSTEM] {len(ready)} test başlatıldı · {browser}{'' if headless else ' (görünür)'}")

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
                        lines = reader.read().splitlines()
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
                    await emit(classify(text), text, progress=progress)
                    for cid, st in changes:
                        await emit("case", case_id=cid, status=st, progress=progress)
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
            await emit("stopped", "[SİSTEM] Koşum durduruldu; sonuçlar kaydedilmedi.")
            return None
        if timed_out:
            await emit("error", f"[HATA] Koşum {runner.TIMEOUT_SEC} saniyede bitmedi ve sonlandırıldı.")

        junit = runner.parse_junit(junit_path, redact)
        results = runner.merge_results(ready, skipped, junit, tracker.state, tail,
                                       process_failed=(process.returncode not in (0, None)), timed_out=timed_out)
        duration = round(time.monotonic() - started, 1)
        meta = {"browser": browser, "headless": headless, "environment": env["name"] if env else None,
                "duration": duration, "skipped": [s["case_id"] for s in skipped]}
        if trigger:
            meta["trigger"] = trigger

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
            await emit("case", case_id=r["case_id"], status=r["status"].lower(), duration=r.get("duration"),
                       error=r["actual_result"] if r["status"] == "Failed" else None)
        if run_id is None:
            await emit("warn", "[UYARI] Koşum sonucu veritabanına kaydedilemedi.")
        else:
            await emit("info", f"[SİSTEM] Koşum kaydedildi: KS-{run_id}.")
            if defect:
                await emit("error", f"[SİSTEM] {counts['failed']} test kaldı; {defect} hata kaydı güncellendi.")
        summary = {"run_id": run_id, "defect": defect, "counts": counts, "duration": duration, "project_id": project_id}
        await emit("summary", progress=100, **summary)
        await emit("done", "[SİSTEM] Koşum tamamlandı. Geçici dosyalar silindi.")
        return summary
    finally:
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
        _release()
