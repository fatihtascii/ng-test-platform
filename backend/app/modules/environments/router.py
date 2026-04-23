from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db
from . import schemas, service

# İki ayrı router oluşturuyoruz
env_router = APIRouter(prefix="/environments", tags=["Environments"])
var_router = APIRouter(prefix="/variables", tags=["Variables"])

# ── ENVIRONMENTS ENDPOINT'LERİ ──
@env_router.post("/", response_model=schemas.EnvironmentResponse, status_code=201)
def create_environment(env: schemas.EnvironmentCreate, db: Session = Depends(get_db)):
    return service.create_environment(db, env)

@env_router.get("/", response_model=list[schemas.EnvironmentResponse])
def get_environments(db: Session = Depends(get_db)):
    return service.get_environments(db)

@env_router.get("/{env_id}", response_model=schemas.EnvironmentResponse)
def get_environment(env_id: int, db: Session = Depends(get_db)):
    return service.get_environment_by_id(db, env_id)

@env_router.put("/{env_id}", response_model=schemas.EnvironmentResponse)
def update_environment(env_id: int, data: schemas.EnvironmentCreate, db: Session = Depends(get_db)):
    return service.update_environment(db, env_id, data)

@env_router.delete("/{env_id}")
def delete_environment(env_id: int, db: Session = Depends(get_db)):
    return service.delete_environment(db, env_id)

# ── VARIABLES ENDPOINT'LERİ ──
@var_router.post("/", response_model=schemas.VariableResponse, status_code=201)
def create_variable(var: schemas.VariableCreate, db: Session = Depends(get_db)):
    return service.create_variable(db, var)

@var_router.get("/", response_model=list[schemas.VariableResponse])
def get_variables(db: Session = Depends(get_db)):
    return service.get_variables(db)

@var_router.put("/{var_id}", response_model=schemas.VariableResponse)
def update_variable(var_id: int, data: schemas.VariableCreate, db: Session = Depends(get_db)):
    return service.update_variable(db, var_id, data)

@var_router.delete("/{var_id}")
def delete_variable(var_id: int, db: Session = Depends(get_db)):
    return service.delete_variable(db, var_id)