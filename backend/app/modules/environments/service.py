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

def create_variable(db: Session, var: schemas.VariableCreate):
    if not var.key.strip():
        raise HTTPException(status_code=400, detail="Değişken anahtarı boş olamaz.")

    if var.env_id:
        existing = db.query(models.Variable).filter_by(
            env_id=var.env_id, key=var.key.strip()
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Bu ortamda aynı anahtara sahip bir değişken zaten var.",
            )

    db_var = models.Variable(**var.model_dump())
    db.add(db_var)
    db.commit()
    db.refresh(db_var)
    return db_var


def get_variables(
    db: Session,
    env_id: Optional[int] = None,
    project_id: Optional[int] = None,
) -> list[models.Variable]:
    # FIX: Filtresiz sorgulama tüm değişkenleri döndürüyordu.
    q = db.query(models.Variable)
    if env_id is not None:
        q = q.filter(models.Variable.env_id == env_id)
    if project_id is not None:
        q = q.filter(models.Variable.project_id == project_id)
    return q.order_by(models.Variable.id.desc()).all()


def update_variable(db: Session, var_id: int, data: schemas.VariableCreate):
    var = db.query(models.Variable).filter(models.Variable.id == var_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Değişken bulunamadı.")

    # Key değişiyorsa çakışma kontrolü
    if data.env_id and data.key != var.key:
        conflict = db.query(models.Variable).filter(
            models.Variable.env_id == data.env_id,
            models.Variable.key == data.key.strip(),
            models.Variable.id != var_id,
        ).first()
        if conflict:
            raise HTTPException(
                status_code=400,
                detail="Bu ortamda aynı anahtara sahip başka bir değişken var.",
            )

    for k, v in data.model_dump().items():
        setattr(var, k, v)
    db.commit()
    db.refresh(var)
    return var


def delete_variable(db: Session, var_id: int):
    var = db.query(models.Variable).filter(models.Variable.id == var_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Değişken bulunamadı.")
    db.delete(var)
    db.commit()
    return {"message": "Değişken silindi."}
