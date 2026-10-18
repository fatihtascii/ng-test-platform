"""
Environments & Variables router.

DÜZELTMELER:
- GET /environments/ ve GET /variables/ endpoint'lerine query filtreler eklendi.
- EnvironmentUpdate schema'sı eklendi (PUT için ayrı schema — URL zorunlu).
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.core.secrets import mask_value
from . import schemas, service

env_router = APIRouter(prefix="/environments", tags=["Environments"])
var_router  = APIRouter(prefix="/variables",   tags=["Variables"])


# ── ENVIRONMENTS ──────────────────────────────────────────────────

@env_router.post("/", dependencies=[Depends(require_permission("environments.manage"))], response_model=schemas.EnvironmentResponse, status_code=201)
def create_environment(env: schemas.EnvironmentCreate, db: Session = Depends(get_db)):
    return service.create_environment(db, env)


@env_router.get("/", dependencies=[Depends(require_permission("environments.view"))], response_model=list[schemas.EnvironmentResponse])
def get_environments(
    db: Session = Depends(get_db),
    project_id: Optional[int] = Query(None, description="Projeye göre filtrele"),
):
    # FIX: project_id filtresi eklendi
    return service.get_environments(db, project_id=project_id)


@env_router.get("/{env_id}", dependencies=[Depends(require_permission("environments.view"))], response_model=schemas.EnvironmentResponse)
def get_environment(env_id: int, db: Session = Depends(get_db)):
    return service.get_environment_by_id(db, env_id)


@env_router.get("/{env_id}/resolved", response_model=list[schemas.ResolvedVariable])
def resolved_variables(env_id: int, db: Session = Depends(get_db),
                       current=Depends(require_permission("environments.view"))):
    """Ortamda koşulan testlerin göreceği değişkenler (ortam > proje > global). Sırlar maskeli."""
    env = service.get_environment_by_id(db, env_id)
    return [{**r, "value": mask_value(r["value"], show_tail=False) if r["is_secret"] else r["value"]}
            for r in service.resolve_variables(db, env)]


@env_router.put("/{env_id}", dependencies=[Depends(require_permission("environments.manage"))], response_model=schemas.EnvironmentResponse)
def update_environment(
    env_id: int,
    data: schemas.EnvironmentCreate,
    db: Session = Depends(get_db),
):
    return service.update_environment(db, env_id, data)


@env_router.delete("/{env_id}", dependencies=[Depends(require_permission("environments.manage"))])
def delete_environment(env_id: int, db: Session = Depends(get_db)):
    return service.delete_environment(db, env_id)


# ── VARIABLES ─────────────────────────────────────────────────────

@var_router.post("/", dependencies=[Depends(require_permission("environments.manage"))], response_model=schemas.VariableResponse, status_code=201)
def create_variable(var: schemas.VariableCreate, db: Session = Depends(get_db)):
    return _masked(service.create_variable(db, var))


def _masked(v):
    return schemas.VariableResponse.model_validate(v).model_copy(
        update={"value": mask_value(v.value, show_tail=False) if v.is_secret else v.value})


@var_router.get("/", response_model=list[schemas.VariableResponse])
def get_variables(
    db: Session = Depends(get_db),
    current=Depends(require_permission("environments.view")),
    env_id:     Optional[int] = Query(None, description="Ortama göre filtrele"),
    project_id: Optional[int] = Query(None, description="Projeye göre filtrele"),
):
    # Sır değerleri listede herkese maskeli döner; yönetici tek tek açabilir (GET /variables/{id}/value).
    # Böylece sırlar sayfa her açıldığında toplu olarak tarayıcıya inmez.
    return [_masked(v) for v in service.get_variables(db, env_id=env_id, project_id=project_id)]


@var_router.get("/{var_id}/value", dependencies=[Depends(require_permission("environments.manage"))])
def reveal_variable(var_id: int, db: Session = Depends(get_db)):
    v = service.get_variable(db, var_id)
    return {"id": v.id, "key": v.key, "value": v.value}


@var_router.put("/{var_id}", dependencies=[Depends(require_permission("environments.manage"))], response_model=schemas.VariableResponse)
def update_variable(
    var_id: int,
    data: schemas.VariableCreate,
    db: Session = Depends(get_db),
):
    return _masked(service.update_variable(db, var_id, data))


@var_router.delete("/{var_id}", dependencies=[Depends(require_permission("environments.manage"))])
def delete_variable(var_id: int, db: Session = Depends(get_db)):
    return service.delete_variable(db, var_id)
