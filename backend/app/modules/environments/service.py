from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project

# ── ENVIRONMENTS (ORTAMLAR) ──
def create_environment(db: Session, env: schemas.EnvironmentCreate):
    if not env.name.strip():
        raise HTTPException(status_code=400, detail="Ortam adı boş olamaz.")
    if not db.query(Project).filter(Project.id == env.project_id).first():
        raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")
        
    db_env = models.Environment(**env.model_dump())
    db.add(db_env)
    db.commit()
    db.refresh(db_env)
    return db_env

def get_environments(db: Session):
    return db.query(models.Environment).all()

def get_environment_by_id(db: Session, env_id: int):
    env = db.query(models.Environment).filter(models.Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Ortam bulunamadı.")
    return env

def update_environment(db: Session, env_id: int, data: schemas.EnvironmentCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Ortam adı boş olamaz.")
        
    env = db.query(models.Environment).filter(models.Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Ortam bulunamadı.")
        
    for k, v in data.model_dump().items():
        setattr(env, k, v)
    db.commit()
    db.refresh(env)
    return env

def delete_environment(db: Session, env_id: int):
    env = db.query(models.Environment).filter(models.Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Ortam bulunamadı.")
    db.delete(env)
    db.commit()
    return {"message": "Ortam silindi."}


# ── VARIABLES (DEĞİŞKENLER) ──
def create_variable(db: Session, var: schemas.VariableCreate):
    if not var.key.strip():
        raise HTTPException(status_code=400, detail="Değişken anahtarı boş olamaz.")
        
    # Aynı ortamda aynı key var mı kontrolü eklenebilir
    if var.env_id:
        existing = db.query(models.Variable).filter_by(env_id=var.env_id, key=var.key).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bu ortamda aynı anahtara sahip bir değişken zaten var.")
            
    db_var = models.Variable(**var.model_dump())
    db.add(db_var)
    db.commit()
    db.refresh(db_var)
    return db_var

def get_variables(db: Session):
    return db.query(models.Variable).all()

def update_variable(db: Session, var_id: int, data: schemas.VariableCreate):
    var = db.query(models.Variable).filter(models.Variable.id == var_id).first()
    if not var:
        raise HTTPException(status_code=404, detail="Değişken bulunamadı.")
        
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