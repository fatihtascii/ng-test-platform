"""Alembic migration'ları: boş DB ve Alembic öncesi (create_all ile oluşmuş) DB."""
import json
import os
import subprocess
import sys
import tempfile

import sqlalchemy as sa

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _py(db_url, code):
    env = dict(os.environ, DATABASE_URL=db_url, PYTHONPATH=BACKEND)
    out = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr[-2000:]


def test_bos_db_head(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    _py(url, "from app.db.migrate import run_migrations; run_migrations()")
    eng = sa.create_engine(url)
    with eng.connect() as c:
        assert c.execute(sa.text("select version_num from alembic_version")).scalar() == "0004"
        cols = {r[1] for r in c.execute(sa.text("pragma table_info(test_runs)"))}
        assert "is_defect" in cols
        assert c.execute(sa.text("select count(*) from defects")).scalar() == 0


def test_alembic_oncesi_db_baseline_ve_backfill(tmp_path):
    url = f"sqlite:///{tmp_path / 'old.db'}"
    # 0001 şemasını kur, sonra Alembic kaydını sil → "eski" DB
    env = dict(os.environ, DATABASE_URL=url, PYTHONPATH=BACKEND)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "0001"], cwd=BACKEND, env=env, check=True, capture_output=True)
    eng = sa.create_engine(url)
    res = json.dumps([{"case_id": 1, "status": "Failed", "actual_result": "patladı"}])
    with eng.begin() as c:
        c.execute(sa.text("drop table alembic_version"))
        c.execute(sa.text("insert into projects(name,status,created_at) values('P','Aktif',CURRENT_TIMESTAMP)"))
        c.execute(sa.text("insert into test_cases(title,status,priority,project_id,tags,execution_type,created_at) values('Giriş','Başarısız','Kritik',1,'[]','Manual',CURRENT_TIMESTAMP)"))
        c.execute(sa.text("insert into test_runs(name,status,project_id,results,created_at) values('Oto-Defect Yakalaması (1)','Failed',1,:r,CURRENT_TIMESTAMP)"), {"r": res})
        c.execute(sa.text("insert into test_runs(name,status,project_id,results,created_at) values('Temiz','Aktif',1,'[]',CURRENT_TIMESTAMP)"))
    eng.dispose()

    _py(url, "from app.db.migrate import run_migrations; run_migrations()")
    eng = sa.create_engine(url)
    with eng.connect() as c:
        assert c.execute(sa.text("select version_num from alembic_version")).scalar() == "0004"
        assert c.execute(sa.text("select is_defect from test_runs where name like 'Oto%'")).scalar() == 1
        rows = c.execute(sa.text("select title, severity, source, test_run_id from defects")).all()
        assert len(rows) == 1 and rows[0].severity == "Kritik" and rows[0].source == "auto"
