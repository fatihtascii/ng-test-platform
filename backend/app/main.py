import os
import sys
import uuid
import logging
import asyncio
import subprocess
import json
import shutil
import tempfile
from app.modules.integrations.mobile_runner import router as mobile_router
from app.modules.defects.router import router as defects_router
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session


# Database
from app.db.database import engine, SessionLocal
from app.db.migrate import run_migrations
from app.core.base import Base

# Modeller
from app.modules.projects      import models as project_models
from app.modules.users         import models as user_models
from app.modules.test_cases    import models as test_case_models
from app.modules.test_plans    import models as test_plan_models
from app.modules.test_runs     import models as test_run_models
from app.modules.environments  import models as env_models
from app.modules.roles         import models as role_models
from app.modules.integrations  import models as int_models

# Router'lar
from app.modules.projects.router      import router as projects_router
from app.modules.users.router         import auth_router, users_router
from app.modules.test_cases.router    import router as test_cases_router
from app.modules.test_plans.router    import router as test_plans_router
from app.modules.test_runs.router     import router as test_runs_router
from app.modules.environments.router  import env_router, var_router
from app.modules.roles.router         import perm_router, role_router
from app.modules.integrations.router  import router as integrations_router

from app.modules.roles.service import seed_rbac
from app.core.deps import user_from_token, has_permission

# ── LOGGER ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("ng-test")

# ── SABITLER ─────────────────────────────────────────────────────
# Koşum dosyaları proje dışındaki sistem temp dizinine yazılır. Proje içine
# (eski: backend/tests) yazılan .py dosyaları `uvicorn --reload`'u tetikleyip
# koşumu yarıda kesiyor ve temizlik hiç çalışmıyordu.
RUN_DIR_PREFIX = "ngtest_run_"
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
BROWSER_MAP = {
    "Chrome":  "chromium",
    "Edge":    "chromium",
    "Firefox": "firefox",
    "Safari":  "webkit",
}


# ── LIFESPAN ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Şema Alembic ile yönetilir (create_all mevcut tablolara yeni kolon ekleyemiyordu)
    run_migrations()

    db = SessionLocal()
    try:
        seed_rbac(db)
        logger.info("RBAC seed tamamlandı.")
    except Exception as e:
        logger.error(f"RBAC seed hatası: {e}")
    finally:
        db.close()

    _cleanup_stale_run_dirs()
    logger.info("🚀 NG Test API Kurumsal Mimaride Başlatıldı!")
    yield
    logger.info("🛑 NG Test API Kapatıldı.")


# ── APP ───────────────────────────────────────────────────────────
app = FastAPI(
    title="NG Test API",
    version="2.0.0",
    description="Enterprise-Grade Test Management System",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── GLOBAL EXCEPTION HANDLER ─────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Beklenmeyen Hata: {request.method} {request.url} — {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Sunucu hatası. Lütfen tekrar deneyin."},
    )


# ── YARDIMCI: Güvenli WS mesaj gönderici ─────────────────────────
async def ws_send(websocket: WebSocket, type_: str, message: str, **extra):
    try:
        await websocket.send_json({"type": type_, "message": message, **extra})
    except Exception:
        pass


# ── YARDIMCI: Önceki çökmüş koşumlardan kalan temp klasörlerini sil ─
def _cleanup_stale_run_dirs(max_age_hours: int = 6):
    root = tempfile.gettempdir()
    now = datetime.now().timestamp()
    for name in os.listdir(root):
        path = os.path.join(root, name)
        if name.startswith(RUN_DIR_PREFIX) and os.path.isdir(path):
            try:
                if now - os.path.getmtime(path) > max_age_hours * 3600:
                    shutil.rmtree(path, ignore_errors=True)
            except OSError:
                pass


# ── YARDIMCI: Test dosyalarını hazırla ───────────────────────────
def _prepare_test_files(cases: list[int], db, run_dir: str) -> tuple[list, list]:
    run_files = []
    skipped   = []
    for cid in cases:
        tc = db.query(test_case_models.TestCase).filter(
            test_case_models.TestCase.id == cid
        ).first()
        if tc and tc.automation_script and tc.automation_script.strip():
            # pytest yalnızca test_*.py dosyalarını test modülü olarak tanır
            fname = os.path.join(run_dir, f"test_case_{cid}_{uuid.uuid4().hex[:8]}.py")
            try:
                with open(fname, "w", encoding="utf-8") as f:
                    f.write(tc.automation_script)
                run_files.append((fname, tc.title, cid))
            except OSError as e:
                logger.error(f"Test dosyası yazılamadı #{cid}: {e}")
                skipped.append(cid)
        else:
            skipped.append(cid)
    return run_files, skipped


# ── YARDIMCI: Otomatik defect kaydı ─────────────────────────────
def _save_automation_run(executed: list[int], failed: set[int], error_details: list[str]) -> tuple[int | None, str | None]:
    """
    Otomasyon koşumunu normal bir TestRun olarak kaydeder, case statülerini günceller
    ve hata varsa koşuma bağlı otomatik defect üretir. (run_id, defect_kodu) döner.
    """
    from app.modules.defects.service import sync_run_defect

    db = SessionLocal()
    try:
        crash_log = "\n".join(error_details[-20:])
        cases = {
            tc.id: tc for tc in db.query(test_case_models.TestCase)
            .filter(test_case_models.TestCase.id.in_(executed)).all()
        }
        if not cases:
            return None, None
        project_id = cases[executed[0]].project_id if executed[0] in cases else next(iter(cases.values())).project_id

        results = []
        for cid in executed:
            is_failed = cid in failed
            results.append({
                "case_id": cid,
                "status": "Failed" if is_failed else "Passed",
                **({"error": f"Otomasyon çıktısı (son satırlar):\n{crash_log}"} if is_failed else {}),
            })
            if cid in cases:
                cases[cid].status = "Başarısız" if is_failed else "Başarılı"

        run = test_run_models.TestRun(
            name=f"Otomasyon koşumu ({datetime.now().strftime('%d.%m %H:%M:%S')})",
            description=f"{len(executed)} otomasyon testi koşuldu, {len(failed)} başarısız.",
            project_id=project_id,
            status="Başarısız" if failed else "Tamamlandı",
            results=json.dumps(results, ensure_ascii=False),
        )
        db.add(run)
        db.flush()
        defect = sync_run_defect(db, run)
        db.commit()
        return run.id, (f"BUG-{defect.id}" if defect else None)
    except Exception as e:
        logger.error(f"Otomasyon koşumu kaydedilemedi: {e}", exc_info=True)
        db.rollback()
        return None, None
    finally:
        db.close()


# ── SATIR SINIFLANDIRICI ─────────────────────────────────────────
def _classify_line(line: str) -> str:
    upper = line.upper()
    if "PASSED" in upper:
        return "success"
    if any(k in upper for k in ("FAILED", "ERROR", "ASSERTION", "EXCEPTION")):
        return "error"
    if any(k in upper for k in ("WARNING", "WARN", "SKIPPED", "XFAIL")):
        return "warn"
    if any(k in upper for k in ("RUNNING", "COLLECTING", "COLLECTED", "SETUP", "TEARDOWN")):
        return "running"
    return "info"


# ── WEBSOCKET (router include'larından ÖNCE) ──────────────────────
@app.websocket("/ws/run-test")
async def websocket_run_test(websocket: WebSocket):
    await websocket.accept()

    # ── YETKİ: tarayıcı WS'te header gönderemediği için token ?token= ile gelir
    _db = SessionLocal()
    try:
        _user = user_from_token(_db, websocket.query_params.get("token"))
        _allowed = bool(_user) and has_permission(_db, _user, "automation.execute")
    finally:
        _db.close()
    if not _user:
        await ws_send(websocket, "error", "[HATA] Oturum geçersiz. Lütfen tekrar giriş yapın.")
        await websocket.close(code=4401)
        return
    if not _allowed:
        await ws_send(websocket, "error", "[HATA] Otomasyon çalıştırma yetkiniz yok (automation.execute).")
        await websocket.close(code=4403)
        return

    process   = None
    run_dir: str | None = None
    # FIX: log_file değişkeni scope dışında None olarak tanımlandı.
    # Eski kodda `if 'log_file' in dir()` kullanılıyordu — bu hatalı ve
    # güvenilmez bir pattern. None kontrolü ile değiştirildi.
    log_file  = None

    try:
        # 1. KONFİGÜRASYON AL ────────────────────────────────────
        try:
            config_data = await asyncio.wait_for(
                websocket.receive_json(), timeout=30.0
            )
        except asyncio.TimeoutError:
            await ws_send(websocket, "error", "[HATA] Konfigürasyon 30 saniye içinde gelmedi.")
            return
        except Exception as json_err:
            await ws_send(websocket, "error", f"[HATA] Beklenmeyen JSON Formatı: {json_err}")
            return

        cases    = config_data.get("cases") or config_data.get("test_case_ids", [])
        browser  = config_data.get("browser", "Chrome")
        headless = config_data.get("headless", True)

        try:
            cases = [int(c) for c in cases]
        except (TypeError, ValueError):
            await ws_send(websocket, "error", "[HATA] Geçersiz test case ID formatı.")
            return

        if not cases:
            await ws_send(websocket, "error", "[HATA] Çalıştırılacak test senaryosu bulunamadı.")
            return

        await ws_send(websocket, "info",
            f"[SİSTEM] Dinamik motor başlatılıyor... ({len(cases)} test seçildi)")

        # 2. TEST DOSYALARINI HAZIRLA ─────────────────────────────
        run_dir = tempfile.mkdtemp(prefix=RUN_DIR_PREFIX)
        db = SessionLocal()
        try:
            run_file_tuples, skipped_ids = _prepare_test_files(cases, db, run_dir)
        finally:
            db.close()

        for sid in skipped_ids:
            await ws_send(websocket, "warn",
                f"[UYARI] #{sid} numaralı test için otomasyon script bulunamadı. Atlanıyor.")

        run_files: list[str] = []
        file_to_case: dict[str, int] = {}
        for fname, title, cid in run_file_tuples:
            run_files.append(fname)
            file_to_case[os.path.basename(fname)] = cid
            await ws_send(websocket, "info",
                f"[SİSTEM] #{cid} '{title}' için senaryo dosyası derlendi.")

        if not run_files:
            await ws_send(websocket, "error",
                "[HATA] Otomasyon script'i olan geçerli test bulunamadı!")
            return

        # 3. PYTEST KOMUTU ────────────────────────────────────────
        pw_browser = BROWSER_MAP.get(browser, "chromium")
        cmd = [
            sys.executable, "-u", "-m", "pytest",
            "-v", "-s", "--tb=short",
            "-p", "no:cacheprovider",          # .pytest_cache bırakmasın
            f"--rootdir={run_dir}",
            f"--browser={pw_browser}",
        ]
        if not headless:
            cmd.append("--headed")
        cmd.extend(run_files)

        log_filename = os.path.join(run_dir, "execution.log")

        my_env = os.environ.copy()
        my_env["PYTHONUNBUFFERED"] = "1"

        # 4. SÜRECİ BAŞLAT ────────────────────────────────────────
        try:
            log_file = open(log_filename, "w", encoding="utf-8")
            process  = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                env=my_env,
                cwd=run_dir,
            )
            logger.info(f"Pytest başlatıldı PID={process.pid}")
        except FileNotFoundError:
            await ws_send(websocket, "error",
                "[KRİTİK] pytest veya playwright bulunamadı. Backend ortamını kontrol edin.")
            return
        except Exception as e:
            await ws_send(websocket, "error", f"[KRİTİK] Motor başlatılamadı: {e}")
            return

        # 5. LOG TAIL ─────────────────────────────────────────────
        total_tests   = len(run_files)
        completed     = 0
        has_error     = False
        error_details: list[str] = []
        failed_case_ids: set[int] = set()

        def _track_case_failure(text: str):
            # pytest -v: "test_case_12_ab12cd34.py::test_login FAILED"
            if any(k in text for k in ("FAILED", "ERROR")):
                for base, cid in file_to_case.items():
                    if base in text:
                        failed_case_ids.add(cid)

        with open(log_filename, "r", encoding="utf-8") as read_log:
            while True:
                try:
                    line = read_log.readline()
                except OSError:
                    break

                if not line:
                    if process.poll() is not None:
                        for r_line in read_log.readlines():
                            decoded = r_line.strip()
                            if not decoded:
                                continue
                            error_details.append(decoded)
                            _track_case_failure(decoded)
                            msg_type = _classify_line(decoded)
                            if msg_type == "error":
                                has_error = True
                            await ws_send(websocket, msg_type, decoded, progress=100)
                        break
                    await asyncio.sleep(0.05)
                    continue

                decoded = line.strip()
                if not decoded:
                    continue

                error_details.append(decoded)
                _track_case_failure(decoded)
                msg_type = _classify_line(decoded)

                if msg_type in ("success", "error"):
                    completed += 1
                    if msg_type == "error":
                        has_error = True

                progress = (
                    min(int((completed / total_tests) * 100), 99)
                    if total_tests > 0 else 0
                )
                await ws_send(websocket, msg_type, decoded, progress=progress)

        try:
            # Senkron wait event loop'u bloklamasın
            await asyncio.to_thread(process.wait, 10)
        except subprocess.TimeoutExpired:
            logger.warning(f"Süreç PID={process.pid} timeout, öldürülüyor.")
            process.kill()

        # 6. KOŞUM + DEFECT KAYDI ────────────────────────────────
        # Çıkış kodu güvenilir kaynak; log satırlarındaki "error" kelimesi tek başına yanıltıcı olabilir
        exit_code = process.returncode
        run_failed = (exit_code != 0) if exit_code is not None else has_error
        executed = [cid for _, _, cid in run_file_tuples]
        failed: set[int] = set()
        if run_failed:
            # Hangi case'in patladığı tespit edilemediyse (ör. import/collection hatası)
            # koşulan tüm case'ler hatalı sayılır — atlananlar hariç
            failed = set(failed_case_ids) or set(executed)
        run_id, defect_code = await asyncio.to_thread(
            _save_automation_run, executed, failed, error_details
        )
        if run_id is None:
            await ws_send(websocket, "warn", "⚠️ [UYARI] Koşum sonucu veritabanına kaydedilemedi.")
        else:
            await ws_send(websocket, "info", f"[SİSTEM] Koşum kaydedildi (#{run_id}).", run_id=run_id)
            if defect_code:
                await ws_send(websocket, "error",
                    f"🔥 [SİSTEM] {len(failed)} test başarısız. {defect_code} defect kaydı oluşturuldu.",
                    defect=defect_code)

        # 7. DONE ─────────────────────────────────────────────────
        await ws_send(websocket, "done",
            "[SİSTEM] Dinamik koşum tamamlandı. Geçici dosyalar imha edildi.")

    except WebSocketDisconnect:
        logger.info("Frontend bağlantıyı kesti.")
    except Exception as e:
        logger.error(f"WebSocket Fatal Error: {e}", exc_info=True)
        await ws_send(websocket, "error", f"[SİSTEM ÇÖKÜŞÜ] {str(e)}")
    finally:
        # FIX: `if 'log_file' in dir()` → başta None atandı, güvenli kontrol
        if log_file is not None and not log_file.closed:
            try:
                log_file.close()
            except Exception:
                pass

        if process and process.poll() is None:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass

        if run_dir:
            shutil.rmtree(run_dir, ignore_errors=True)


# ── ROUTER KAYITLARI ──────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(role_router)
app.include_router(perm_router)
app.include_router(projects_router)
app.include_router(env_router)
app.include_router(var_router)
app.include_router(test_cases_router)
app.include_router(test_plans_router)
app.include_router(test_runs_router)
app.include_router(defects_router)
app.include_router(integrations_router)
app.include_router(mobile_router, prefix="/api/mobile", tags=["Mobile Tests"])



# ── SONDA "/" EKSİK İSTEKLER ─────────────────────────────────────
# "/projects" gibi istekler FastAPI'de "/projects/"e 307 ile yönlendirilir: her istek iki kez
# gider ve HTTPS arkasında (proxy) yönlendirme http:// adresine dönüp "mixed content" ile kırılır.
# Yönlendirmek yerine yolu doğrudan "/projects/" olarak eşliyoruz.
class _TrailingSlashMiddleware:
    def __init__(self, asgi_app):
        self.app = asgi_app
        self._paths: set[str] | None = None

    def _collection_paths(self) -> set[str]:
        # OpenAPI şeması FastAPI sürümünden bağımsız olarak tüm HTTP yollarını içerir
        if self._paths is None:
            self._paths = {
                path for path in app.openapi().get("paths", {})
                if path.endswith("/") and path != "/" and "{" not in path
            }
        return self._paths

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope["path"]
            if not path.endswith("/") and path + "/" in self._collection_paths():
                scope = dict(scope, path=path + "/", raw_path=(path + "/").encode())
        await self.app(scope, receive, send)


app.add_middleware(_TrailingSlashMiddleware)


# ── HEALTH CHECK ─────────────────────────────────────────────────
@app.get("/", tags=["Health Check"])
def root():
    return {
        "status":  "ok",
        "message": "NG Test API Running Successfully!",
        "version": "2.0.0",
    }
