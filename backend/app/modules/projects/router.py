from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.deps import get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post("/", dependencies=[Depends(require_permission("projects.create"))], response_model=schemas.ProjectResponse, status_code=201)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return service.create_project(db, project)


@router.get("/", dependencies=[Depends(require_permission("projects.view"))], response_model=list[schemas.ProjectResponse])
def get_projects(db: Session = Depends(get_db),
                 with_stats: bool = Query(False, description="Case/plan/koşum/hata sayılarını ekle")):
    return service.get_projects(db, with_stats)


@router.get("/{project_id}", dependencies=[Depends(require_permission("projects.view"))], response_model=schemas.ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db), with_stats: bool = Query(False)):
    return service.get_project(db, project_id, with_stats)


@router.put("/{project_id}", dependencies=[Depends(require_permission("projects.edit"))], response_model=schemas.ProjectResponse)
def update_project(project_id: int, project_data: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    return service.update_project(db, project_id, project_data)


@router.patch("/{project_id}", dependencies=[Depends(require_permission("projects.edit"))], response_model=schemas.ProjectResponse)
def patch_project(project_id: int, project_data: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    return service.update_project(db, project_id, project_data)


@router.delete("/{project_id}", dependencies=[Depends(require_permission("projects.delete"))])
def delete_project(project_id: int, db: Session = Depends(get_db)):
    return service.delete_project(db, project_id)
