"""
Backend test altyapısı.

Her test oturumu geçici bir SQLite veritabanı kullanır (gerçek .env'deki DB'ye dokunulmaz).
Her testten sonra veri tabloları temizlenir; roller/izinler (seed) korunur.
"""
import os
import sys
import tempfile

import pytest

_DB_DIR = tempfile.mkdtemp(prefix="ngtest_db_")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_DB_DIR, 'test.db')}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-test-secret-key-test-secret-key"
os.environ["APP_ENV"] = "test"
os.environ["NG_SYNC_HOOKS"] = "1"          # entegrasyon işleri testte sırayla çalışsın
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main_module  # noqa: E402
from app.core.base import Base  # noqa: E402
from app.db.database import SessionLocal, engine  # noqa: E402
from app.modules.users import schemas as user_schemas, service as user_service  # noqa: E402

KEEP_TABLES = {"roles", "permissions", "role_permissions", "alembic_version"}


@pytest.fixture(scope="session")
def client():
    with TestClient(main_module.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_db(client):
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name not in KEEP_TABLES:
                conn.execute(table.delete())
    # bellekteki giriş denemesi sayaçlarını da sıfırla
    user_service._login_attempts.clear()


@pytest.fixture
def make_user():
    def _make(username, role="viewer", password="Passw0rd1", **extra):
        db = SessionLocal()
        try:
            user_service.create_user(
                db, user_schemas.UserCreate(username=username, password=password, role=role, **extra),
                is_external=False,
            )
        finally:
            db.close()
        return username, password
    return _make


@pytest.fixture
def login(client):
    def _login(username, password="Passw0rd1"):
        r = client.post("/auth/login", json={"identifier": username, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    return _login


@pytest.fixture
def admin(make_user, login):
    make_user("boss", role="admin")
    return login("boss")


@pytest.fixture
def project(client, admin):
    r = client.post("/projects/", json={"name": "Demo"}, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()
