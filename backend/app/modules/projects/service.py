from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas

def get_projects(db: Session):
    return db.query(models.Project).all()

def get_project_by_id(db: Session, project_id: int):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")
    return project

def create_project(db: Session, project: schemas.ProjectCreate):
    if not project.name.strip():
        raise HTTPException(status_code=400, detail="Proje adı boş olamaz.")
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def update_project(db: Session, project_id: int, project_data: schemas.ProjectCreate):
    project = get_project_by_id(db, project_id)
    if not project_data.name.strip():
        raise HTTPException(status_code=400, detail="Proje adı boş olamaz.")
    project.name        = project_data.name
    project.description = project_data.description
    project.status      = project_data.status
    db.commit()
    db.refresh(project)
    return project

def delete_project(db: Session, project_id: int):
    project = get_project_by_id(db, project_id)
    db.delete(project)
    db.commit()
    return {"message": "Proje silindi."}