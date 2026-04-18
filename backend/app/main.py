import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Database
from app.db.database import engine, Base, SessionLocal

# Modeller (Tabloların Alembic olmadan yaratılması için bir kere import edilmeli)
from app.modules.projects import models as project_models
from app.modules.users import models as user_models
from app.modules.test_cases import models as test_case_models
from app.modules.test_plans import models as test_plan_models
from app.modules.test_runs import models as test_run_models
from app.modules.environments import models as env_models
from app.modules.roles import models as role_models

# Router'lar
from app.modules.projects.router import router as projects_router
from app.modules.users.router import auth_router, users_router
from app.modules.test_cases.router import router as test_cases_router
from app.modules.test_plans.router import router as test_plans_router
from app.modules.test_runs.router import router as test_runs_router
from app.modules.test_runs.router import ws_router as websocket_router
from app.modules.environments.router import env_router, var_router
from app.modules.roles.router import perm_router, role_router

# Service (Seed işlemi için)
from app.modules.roles.service import seed_rbac

# Logger Ayarı
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("ng-test")

# ── LIFESPAN (Uygulama Açılış & Kapanış) ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Veritabanı tablolarını oluştur
    Base.metadata.create_all(bind=engine)
    
    # Varsayılan rolleri ve izinleri (Seed) veritabanına yaz
    db = SessionLocal()
    try:
        seed_rbac(db)
    finally:
        db.close()
        
    logger.info("🚀 NG Test API Kurumsal Mimaride Başlatıldı!")
    yield
    logger.info("🛑 NG Test API Kapatıldı.")

# ── APP INITIALIZATION ──
app = FastAPI(
    title="NG Test API",
    version="2.0.0",
    description="Enterprise-Grade Test Management System",
    lifespan=lifespan,
)

# ── CORS MIDDLEWARE ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── GLOBAL EXCEPTION HANDLER ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    exc_msg = str(exc).lower()
    logger.error(f"Beklenmeyen Hata: {request.method} {request.url} - {exc}")

    if "password authentication" in exc_msg or "authentication failed" in exc_msg:
        return JSONResponse(status_code=500, content={"detail": "Veritabanı kimlik doğrulama hatası."})
    if "connection refused" in exc_msg or "could not connect" in exc_msg:
        return JSONResponse(status_code=503, content={"detail": "Veritabanına bağlanılamıyor."})
    return JSONResponse(status_code=500, content={"detail": "Sunucu hatası. Lütfen tekrar deneyin."})

# ── ROUTER KAYITLARI (MODÜLLER) ──
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
app.include_router(websocket_router)

@app.get("/", tags=["Health Check"])
def root():
    return {"status": "ok", "message": "NG Test API Running Successfully!"}