"""
Test Plans router.

DÜZELTMELER:
- add_item_to_plan: body: dict yerine AddItemRequest schema kullanılıyor.
  dict ile gelen payload'da type safety yoktu ve FastAPI docs'ta görünmüyordu.
- Tüm response_model'ler tutarlı hale getirildi.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/test-plans", tags=["Test Plans"])


# FIX: body: dict yerine tip-güvenli schema
class AddItemRequest(BaseModel):
    test_case_id: int


@router.post("/", dependencies=[Depends(require_permission("test_plans.create"))], response_model=schemas.TestPlanResponse, status_code=201)
def create_test_plan(plan: schemas.TestPlanCreate, db: Session = Depends(get_db)):
    return service.create_test_plan(db, plan)


@router.get("/", dependencies=[Depends(require_permission("test_plans.view"))], response_model=list[schemas.TestPlanResponse])
def get_test_plans(db: Session = Depends(get_db)):
    return service.get_test_plans(db)


@router.get("/{plan_id}", dependencies=[Depends(require_permission("test_plans.view"))], response_model=schemas.TestPlanResponse)
def get_test_plan(plan_id: int, db: Session = Depends(get_db)):
    return service.get_test_plan_by_id(db, plan_id)


@router.put("/{plan_id}", dependencies=[Depends(require_permission("test_plans.edit"))], response_model=schemas.TestPlanResponse)
def update_test_plan(
    plan_id: int,
    data: schemas.TestPlanCreate,
    db: Session = Depends(get_db),
):
    return service.update_test_plan(db, plan_id, data)


@router.delete("/{plan_id}", dependencies=[Depends(require_permission("test_plans.delete"))])
def delete_test_plan(plan_id: int, db: Session = Depends(get_db)):
    return service.delete_test_plan(db, plan_id)


@router.post("/{plan_id}/bulk-add", dependencies=[Depends(require_permission("test_plans.edit"))])
def bulk_add_to_plan(
    plan_id: int,
    request: schemas.BulkAddRequest,
    db: Session = Depends(get_db),
):
    return service.bulk_add_to_plan(db, plan_id, request)


@router.post("/{plan_id}/items", dependencies=[Depends(require_permission("test_plans.edit"))], response_model=schemas.TestPlanResponse)
def add_item_to_plan(
    plan_id: int,
    body: AddItemRequest,       # FIX: dict → schema
    db: Session = Depends(get_db),
):
    return service.add_item_to_plan(db, plan_id, body.test_case_id)


@router.delete("/{plan_id}/items/{item_id}", dependencies=[Depends(require_permission("test_plans.edit"))])
def remove_item_from_plan(
    plan_id: int,
    item_id: int,
    db: Session = Depends(get_db),
):
    return service.remove_item_from_plan(db, plan_id, item_id)


@router.patch(
    "/{plan_id}/items/{item_id}", dependencies=[Depends(require_permission("test_runs.execute"))],
    response_model=schemas.TestPlanItemResponse,
)
def update_item_status(
    plan_id: int,
    item_id: int,
    body: schemas.TestPlanItemUpdate,
    db: Session = Depends(get_db),
):
    return service.update_item_status(db, plan_id, item_id, body)
