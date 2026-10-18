"""
Environments & Variables service.

DÜZELTMELER:
- get_environments: project_id filtresi eklendi.
- get_variables: env_id ve project_id filtresi eklendi.
- url strip + boşluk kontrolü create/update'e eklendi.
- Variable güncelleme: key değişiyorsa UniqueConstraint ihlali önceden
  kontrol ediliyor (409 yerine anlaşılır 400 mesajı).
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import Optional
from . import models, schemas
from app.modules.projects.models import Project


# ── ENVIRONMENTS ──────────────────────────────────────────────────

def create_environment(db: Session, env: schemas.EnvironmentCreate):
    if not env.name.strip():
        raise HTTPException(status_code=400, detail="Ortam adı boş olamaz.")
    if not env.url.strip():
        raise HTTPException(status_code=400, detail="URL boş olamaz.")
    if not db.query(Project).filter(Project.id == env.project_id).first():
        raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")

    db_env = models.Environment(**env.model_dump())
    db.add(db_env)
    db.commit()
    db.refresh(db_env)
    return db_env


def get_environments(
    db: Session,
    project_id: Optional[int] = None,
) -> list[models.Environment]:
    # FIX: Filtresiz sorgulama tüm ortamları döndürüyordu.
    # Frontend proje bazlı çalıştığından project_id filtresi eklendi.
    q = db.query(models.Environment)
    if project_id is not None:
        q = q.filter(models.Environment.project_id == project_id)
    return q.order_by(models.Environment.id.desc()).all()


def get_environment_by_id(db: Session, env_id: int) -> models.Environment:
    env = db.query(models.Environment).filter(models.Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Ortam bulunamadı.")
    return env


def update_environment(db: Session, env_id: int, data: schemas.EnvironmentCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Ortam adı boş olamaz.")
    if not data.url.strip():
        raise HTTPException(status_code=400, detail="URL boş olamaz.")

    env = get_environment_by_id(db, env_id)

    # Proje değişiyorsa yeni projeyi doğrula
    if data.project_id != env.project_id:
        if not db.query(Project).filter(Project.id == data.project_id).first():
            raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")

    for k, v in data.model_dump().items():
        setattr(env, k, v)
    db.commit()
    db.refresh(env)
    return env


def delete_environment(db: Session, env_id: int):
    env = get_environment_by_id(db, env_id)
    db.delete(env)
    db.commit()
    return {"message": "Ortam silindi."}


# ── VARIABLES ─────────────────────────────────────────────────────
#
# Kapsam: global (proje ve ortam yok) < proje (ortam yok) < ortam.
# Ortam seçilen değişkenin projesi her zaman ortamın projesidir.

def _normalize_scope(db: Session, data: schemas.VariableCreate) -> tuple[Optional[int], Optional[int]]:
    project_id, env_id = data.project_id, data.env_id
    if env_id:
        env = db.query(models.Environment).filter(models.Environment.id == env_id).first()
        if not env:
            raise HTTPException(status_code=404, detail="Ortam bulunamadı.")
        if project_id and project_id != env.project_id:
            raise HTTPException(status_code=400, detail="Seçilen ortam bu projeye ait değil.")
        project_id = env.project_id
    elif project_id and not db.query(Project.id).filter(Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")
    return project_id, env_id


def _assert_unique(db: Session, key: str, project_id, env_id, exclude_id=None):
    q = db.query(models.Variable).filter(models.Variable.key == key)
    if env_id:
        q = q.filter(models.Variable.env_id == env_id)
    else:
        # NULL'lar benzersizlik kısıtında eşit sayılmadığı için global/proje kapsamı burada denetlenir
        q = q.filter(models.Variable.env_id.is_(None),
                     models.Variable.project_id.is_(None) if project_id is None else models.Variable.project_id == project_id)
    if exclude_id is not None:
        q = q.filter(models.Variable.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"{key} bu kapsamda zaten tanımlı.")


def create_variable(db: Session, var: schemas.VariableCreate):
    project_id, env_id = _normalize_scope(db, var)
    _assert_unique(db, var.key, project_id, env_id)
    db_var = models.Variable(key=var.key, value=var.value, project_id=project_id, env_id=env_id,
                             is_secret=bool(var.is_secret))
    db.add(db_var)
    db.commit()
    db.refresh(db_var)
    return db_var


def get_variables(
    db: Session,
    env_id: Optional[int] = None,
    project_id: Optional[int] = None,
) -> list[models.Variable]:
    q = db.query(models.Variable)
    if env_id is not None:
        q = q.filter(models.Variable.env_id == env_id)
    if project_id is not None:
        q = q.filter(models.Variable.project_id == project_id)
    return q.order_by(models.Variable.key, models.Variable.id).all()


def get_variable(db: Session, var_id: int) -> models.Variable:
    var = db.query(models.Variable).filter(models.Variable.id == var_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Değişken bulunamadı.")
    return var


def update_variable(db: Session, var_id: int, data: schemas.VariableCreate):
    from app.core.secrets import is_masked
    var = get_variable(db, var_id)
    project_id, env_id = _normalize_scope(db, data)
    _assert_unique(db, data.key, project_id, env_id, exclude_id=var_id)
    var.key, var.project_id, var.env_id = data.key, project_id, env_id
    # Maskeli değer geri gelirse "değişmedi" demektir; kayıtlı değer korunur
    if not is_masked(data.value):
        var.value = data.value
    var.is_secret = bool(data.is_secret)
    db.commit()
    db.refresh(var)
    return var


def delete_variable(db: Session, var_id: int):
    var = get_variable(db, var_id)
    db.delete(var)
    db.commit()
    return {"message": "Değişken silindi."}


def resolve_variables(db: Session, env: models.Environment) -> list[dict]:
    """Ortamda geçerli değişkenler: ortam > proje > global. Ham değerleri döndürür."""
    rows = db.query(models.Variable).filter(
        (models.Variable.env_id == env.id)
        | ((models.Variable.env_id.is_(None)) & (models.Variable.project_id == env.project_id))
        | ((models.Variable.env_id.is_(None)) & (models.Variable.project_id.is_(None)))
    ).all()
    rank = lambda v: 2 if v.env_id else 1 if v.project_id else 0  # noqa: E731
    merged: dict[str, models.Variable] = {}
    for v in sorted(rows, key=rank):
        merged[v.key] = v
    out = [{"key": "BASE_URL", "value": env.url, "is_secret": False, "source": "env", "variable_id": 0}] \
        if "BASE_URL" not in merged else []
    for key in sorted(merged):
        v = merged[key]
        out.append({"key": key, "value": v.value, "is_secret": v.is_secret,
                    "source": ["global", "project", "env"][rank(v)], "variable_id": v.id})
    return out
