import os
import sys
import uuid
import logging
import asyncio
import subprocess
import json
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Database
from app.db.database import engine, SessionLocal
from app.core.base import Base

# Modeller
from app.modules.projects import models as project_models
from app.modules.users import models as user_models
from app.modules.test_cases import models as test_case_models
from app.modules.test_plans import models as test_plan_models
from app.modules.test_runs import models as test_run_models
from app.modules.environments import models as env_models
from app.modules.roles import models as role_models
from app.modules.integrations import models as int_models

# Router'lar
from app.modules.projects.router import router as projects_router
from app.modules.users.router import auth_router, users_router
from app.modules.test_cases.router import router as test_cases_router
from app.modules.test_plans.router import router as test_plans_router
from app.modules.test_runs.router import router as test_runs_router
from app.modules.environments.router import env_router, var_router
from app.modules.roles.router import perm_router, role_router
from app.modules.integrations.router import router as integrations_router

# Service
from app.modules.roles.service import seed_rbac

# ── LOGGER ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger("ng-test")

# ── SABITLER ─────────────────────────────────────────────────────
TESTS_DIR = "tests"
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
BROWSER_MAP = {
    "Chrome": "chromium",
    "Edge":   "chromium",
    "Firefox":"firefox",
    "Safari": "webkit",
}

# ── LIFESPAN ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Veritabanı tabloları doğrulandı.")
    except Exception as e:
        logger.error(f"DB tablo oluşturma hatası: {e}")

    db = SessionLocal()
    try:
        seed_rbac(db)
        logger.info("RBAC seed tamamlandı.")
    except Exception as e:
        logger.error(f"RBAC seed hatası: {e}")
    finally:
        db.close()

    os.makedirs(TESTS_DIR, exist_ok=True)

    logger.info("🚀 NG Test API Kurumsal Mimaride Başlatıldı!")
    yield
    logger.info("🛑 NG Test API Kapatıldı.")


# ── APP INITIALIZATION ────────────────────────────────────────────
app = FastAPI(
    title="NG Test API",
    version="2.0.0",
    description="Enterprise-Grade Test Management System",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────
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
    logger.error(f"Beklenmeyen Hata: {request.method} {request.url} — {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Sunucu hatası. Lütfen tekrar deneyin."}
    )


# ── YARDIMCI: Güvenli WS mesaj gönderici ─────────────────────────
async def ws_send(websocket: WebSocket, type_: str, message: str, **extra):
    try:
        payload = {"type": type_, "message": message, **extra}
        await websocket.send_json(payload)
    except Exception:
        pass


# ── YARDIMCI: Test case'lerden geçici dosya oluştur ───────────────
def _prepare_test_files(cases: list[int], db) -> tuple[list[str], list[str]]:
    run_files = []
    skipped = []
    for cid in cases:
        tc = db.query(test_case_models.TestCase).filter(
            test_case_models.TestCase.id == cid
        ).first()

        if tc and tc.automation_script and tc.automation_script.strip():
            fname = os.path.join(TESTS_DIR, f"temp_{uuid.uuid4().hex}.py")
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


# ── YARDIMCI: Otomatik defect kaydı oluştur ──────────────────────
def _save_defect_run(cases: list[int], error_details: list[str]):
    db = SessionLocal()
    try:
        crash_log = "\n".join(error_details[-20:])
        first_case_id = cases[0] if cases else 0

        tc = db.query(test_case_models.TestCase).filter(
            test_case_models.TestCase.id == first_case_id
        ).first()
        project_id = tc.project_id if tc else 1

        results_array = [
            {"case_id": cid, "status": "Failed", "error": f"Otomasyon Çöküş Logu:\n{crash_log}"}
            for cid in cases
        ]
        now_str = datetime.now().strftime('%H:%M:%S')

        new_run = test_run_models.TestRun(
            name=f"Oto-Defect Yakalaması ({now_str})",
            project_id=project_id,
            status="Failed",
            results=json.dumps(results_array),
        )
        db.add(new_run)
        db.commit()
        logger.info(f"Defect kaydı oluşturuldu: proje={project_id}, case sayısı={len(cases)}")
        return True
    except Exception as e:
        logger.error(f"Defect kaydedilemedi: {e}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()


# ── 🚨 KRİTİK: WEBSOCKET ENDPOINT (ROUTERLARDAN ÖNCE YAZILMALI) ──
# Eğer test_runs_router içinde de "/ws/run-test" tanımlıysa, 
# FastAPI yukarıdan aşağı okuduğu için bu ana bloğu ezebilir.
# Bu yüzden app.websocket tanımı include_router'lardan ÖNCE geliyor.
@app.websocket("/ws/run-test")
async def websocket_run_test(websocket: WebSocket):
    await websocket.accept()
    process   = None
    temp_files = []

    try:
        # 1. KONFİGÜRASYON AL ────────────────────────────────────
        try:
            config_data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
        except asyncio.TimeoutError:
            await ws_send(websocket, "error", "[HATA] Konfigürasyon 30 saniye içinde gelmedi.")
            return
        except Exception as json_err:
            await ws_send(websocket, "error", f"[HATA] Beklenmeyen JSON Formatı: {json_err}")
            return

        # Frontend'den gelen payload esnekliğini sağlıyoruz
        cases = config_data.get("cases", [])
        if not cases:
            # Belki frontend test_case_ids gönderiyordur
            cases = config_data.get("test_case_ids", [])
            
        browser  = config_data.get("browser", "Chrome")
        headless = config_data.get("headless", True)

        try:
            cases = [int(c) for c in cases]
        except (TypeError, ValueError):
            await ws_send(websocket, "error", "[HATA] Geçersiz test case ID formatı.")
            return

        if not cases:
            await ws_send(websocket, "error", "[HATA] Çalıştırılacak test senaryosu (ID) bulunamadı.")
            return

        await ws_send(websocket, "info",
            f"[SİSTEM] Dinamik motor başlatılıyor... ({len(cases)} test seçildi)")

        # 2. TEST DOSYALARINI HAZIRLA ─────────────────────────────
        db = SessionLocal()
        try:
            run_file_tuples, skipped_ids = _prepare_test_files(cases, db)
        finally:
            db.close()

        for skipped_id in skipped_ids:
            await ws_send(websocket, "warn",
                f"[UYARI] #{skipped_id} numaralı test için yazılmış bir otomasyon script'i bulunamadı. Atlanıyor.")

        run_files = []
        for fname, title, cid in run_file_tuples:
            temp_files.append(fname)
            run_files.append(fname)
            await ws_send(websocket, "info",
                f"[SİSTEM] #{cid} '{title}' için senaryo dosyası derlendi.")

        if not run_files:
            await ws_send(websocket, "error",
                "[HATA] Kodları yazılmış (script'i olan) hiçbir geçerli test bulunamadı!")
            return

        # 3. PYTEST KOMUTUNU OLUŞTUR ─────────────────────────────
        pw_browser = BROWSER_MAP.get(browser, "chromium")

        cmd = [
            sys.executable, "-u", "-m", "pytest",
            "-v", "-s", "--tb=short",
            f"--browser={pw_browser}",
        ]
        if not headless:
            cmd.append("--headed")
        cmd.extend(run_files)

        log_filename = os.path.join(TESTS_DIR, f"execution_{uuid.uuid4().hex}.log")
        temp_files.append(log_filename)

        my_env = os.environ.copy()
        my_env["PYTHONUNBUFFERED"] = "1"

        # 4. SÜRECİ BAŞLAT ────────────────────────────────────────
        try:
            log_file = open(log_filename, "w", encoding="utf-8")
            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                env=my_env,
                cwd=os.getcwd(),
            )
            logger.info(f"Pytest başlatıldı PID={process.pid}, browser={pw_browser}, headless={headless}")
        except FileNotFoundError:
            await ws_send(websocket, "error",
                "[KRİTİK HATA] pytest veya playwright modülü bulunamadı. Backend ortamını kontrol edin.")
            return
        except Exception as e:
            await ws_send(websocket, "error", f"[KRİTİK HATA] Motor başlatılamadı: {e}")
            return

        # 5. LOG DOSYASINI TAIL ET ────────────────────────────────
        total_tests    = len(run_files)
        completed      = 0
        has_error      = False
        error_details  = []

        with open(log_filename, "r", encoding="utf-8") as read_log:
            while True:
                try:
                    line = read_log.readline()
                except OSError:
                    break

                if not line:
                    if process.poll() is not None:
                        remaining = read_log.readlines()
                        for r_line in remaining:
                            decoded = r_line.strip()
                            if not decoded:
                                continue
                            error_details.append(decoded)
                            msg_type = _classify_line(decoded)
                            if msg_type == "error":
                                has_error = True
                            await ws_send(websocket, msg_type, decoded, progress=100)
                        break
                    else:
                        await asyncio.sleep(0.05)
                        continue

                decoded = line.strip()
                if not decoded:
                    continue

                error_details.append(decoded)
                msg_type = _classify_line(decoded)

                if msg_type in ("success", "error"):
                    completed += 1
                    if msg_type == "error":
                        has_error = True

                progress = min(int((completed / total_tests) * 100), 99) if total_tests > 0 else 0
                await ws_send(websocket, msg_type, decoded, progress=progress)

        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            logger.warning(f"Süreç PID={process.pid} timeout yedi, öldürülüyor.")
            process.kill()

        # 6. DEFECT KAYDI ─────────────────────────────────────────
        if has_error:
            success = _save_defect_run(cases, error_details)
            if success:
                await ws_send(websocket, "error",
                    "🔥 [SİSTEM] Hata yakalandı. Otomatik olarak Defect listesine eklendi.")
            else:
                await ws_send(websocket, "warn",
                    "⚠️ [UYARI] Defect kaydedilirken veri tabanı hatası oluştu.")

        # 7. DONE ─────────────────────────────────────────────────
        await ws_send(websocket, "done",
            "[SİSTEM] Dinamik koşum tamamlandı. Geçici dosyalar imha edildi.")

    except WebSocketDisconnect:
        logger.info("Frontend terminali bağlantıyı kesti.")

    except Exception as e:
        logger.error(f"WebSocket Fatal Error: {e}", exc_info=True)
        await ws_send(websocket, "error", f"[SİSTEM ÇÖKÜŞÜ] {str(e)}")

    finally:
        try:
            if 'log_file' in dir() and not log_file.closed:
                log_file.close()
        except Exception:
            pass

        if process and process.poll() is None:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass

        for f in temp_files:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except OSError:
                    pass

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


# ── ROUTER KAYITLARI (WebSocket'ten SONRA!) ───────────────────────
# FastAPI rotaları sırayla okur. Çakışma olmaması için router'lar en sona alındı.
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
app.include_router(integrations_router)


# ── ROOT ENDPOINT ─────────────────────────────────────────────────
@app.get("/", tags=["Health Check"])
def root():
    return {
        "status": "ok",
        "message": "NG Test API Running Successfully!",
        "version": "2.0.0",
    }