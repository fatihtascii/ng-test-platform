from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from . import schemas, service

router = APIRouter(prefix="/test-plans", tags=["Test Plans"])

@router.post("/", response_model=schemas.TestPlanResponse, status_code=201)
def create_test_plan(plan: schemas.TestPlanCreate, db: Session = Depends(get_db)):
    return service.create_test_plan(db, plan)

@router.get("/", response_model=list[schemas.TestPlanResponse])
def get_test_plans(db: Session = Depends(get_db)):
    return service.get_test_plans(db)

@router.get("/{plan_id}", response_model=schemas.TestPlanResponse)
def get_test_plan(plan_id: int, db: Session = Depends(get_db)):
    return service.get_test_plan_by_id(db, plan_id)

@router.put("/{plan_id}", response_model=schemas.TestPlanResponse)
def update_test_plan(plan_id: int, data: schemas.TestPlanCreate, db: Session = Depends(get_db)):
    return service.update_test_plan(db, plan_id, data)

@router.delete("/{plan_id}")
def delete_test_plan(plan_id: int, db: Session = Depends(get_db)):
    return service.delete_test_plan(db, plan_id)

# ── ITEM ROUTE'LARI ──
@router.post("/{plan_id}/bulk-add")
def bulk_add_to_plan(plan_id: int, request: schemas.BulkAddRequest, db: Session = Depends(get_db)):
    return service.bulk_add_to_plan(db, plan_id, request)

@router.post("/{plan_id}/items")
def add_item_to_plan(plan_id: int, body: dict, db: Session = Depends(get_db)):
    # Body'den tc_id almak için küçük bir workaround (schema da kullanılabilir)
    return service.add_item_to_plan(db, plan_id, body.get("test_case_id"))

@router.delete("/{plan_id}/items/{item_id}")
def remove_item_from_plan(plan_id: int, item_id: int, db: Session = Depends(get_db)):
    return service.remove_item_from_plan(db, plan_id, item_id)

@router.patch("/{plan_id}/items/{item_id}", response_model=schemas.TestPlanItemResponse)
def update_item_status(plan_id: int, item_id: int, body: schemas.TestPlanItemUpdate, db: Session = Depends(get_db)):
    return service.update_item_status(db, plan_id, item_id, body)