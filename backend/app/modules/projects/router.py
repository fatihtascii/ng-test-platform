from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from . import schemas, service

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.post("/", response_model=schemas.ProjectResponse, status_code=201)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return service.create_project(db, project)

@router.get("/", response_model=list[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    return service.get_projects(db)

@router.get("/{project_id}", response_model=schemas.ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return service.get_project_by_id(db, project_id)

@router.put("/{project_id}", response_model=schemas.ProjectResponse)
def update_project(project_id: int, project_data: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return service.update_project(db, project_id, project_data)

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    return service.delete_project(db, project_id)