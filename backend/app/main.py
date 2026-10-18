import logging
from app.modules.integrations.mobile_runner import router as mobile_router
from app.modules.defects.router import router as defects_router
from app.modules.automation.router import router as automation_router
from app.modules.automation.trigger import router as automation_trigger_router
from app.modules.integrations import hooks as _integration_hooks  # noqa: F401  commit sonrası işleri kaydeder
from app.modules.automation.runner import cleanup_stale_run_dirs
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
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

# ── LOGGER ───────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("ng-test")

# ── SABITLER ─────────────────────────────────────────────────────
# Otomasyon motoru app/modules/automation altında (WebSocket: /ws/run-test).
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


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

    cleanup_stale_run_dirs()
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


# ── ROUTER KAYITLARI ──────────────────────────────────────────────
app.include_router(automation_router)   # /ws/run-test
app.include_router(automation_trigger_router)   # /automation/runs, /webhooks/github
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
