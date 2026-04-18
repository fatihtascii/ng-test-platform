from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project

def create_test_run(db: Session, run: schemas.TestRunCreate):
    if not run.name.strip():
        raise HTTPException(status_code=400, detail="Koşum adı boş olamaz.")
    if not db.query(Project).filter(Project.id == run.project_id).first():
        raise HTTPException(status_code=404, detail="Bağlı proje bulunamadı.")
        
    db_run = models.TestRun(**run.model_dump())
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run

def get_test_runs(db: Session):
    return db.query(models.TestRun).all()

def get_test_run_by_id(db: Session, run_id: int):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Test koşumu bulunamadı.")
    return run

def update_test_run(db: Session, run_id: int, data: schemas.TestRunCreate):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Koşum adı boş olamaz.")
        
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Test koşumu bulunamadı.")
        
    for k, v in data.model_dump().items():
        setattr(run, k, v)
        
    db.commit()
    db.refresh(run)
    return run

def delete_test_run(db: Session, run_id: int):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Test koşumu bulunamadı.")
    db.delete(run)
    db.commit()
    return {"message": "Test koşumu silindi."}