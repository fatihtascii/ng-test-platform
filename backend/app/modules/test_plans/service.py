from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_cases.models import TestCase

# Helper: Frontend'in beklediği karmaşık JSON yapısını oluşturan fonksiyon
def _serialize_plan(plan: models.TestPlan) -> dict:
    return {
        "id":          plan.id,
        "title":       plan.title,
        "description": plan.description,
        "status":      plan.status,
        "project_id":  plan.project_id,
        "start_date":  plan.start_date,
        "end_date":    plan.end_date,
        "created_at":  plan.created_at,
        "items": [
            {
                "id":                 item.id,
                "test_case_id":       item.test_case_id,
                "run_status":         item.run_status,
                "note":               item.note,
                "test_case_title":    item.test_case.title    if item.test_case else None,
                "test_case_priority": item.test_case.priority if item.test_case else None,
            }
            for item in plan.items
        ],
    }

def create_test_plan(db: Session, plan: schemas.TestPlanCreate):
    if not plan.title.strip():
        raise HTTPException(status_code=400, detail="Plan başlığı boş olamaz.")
    if not db.query(Project).filter(Project.id == plan.project_id).first():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")
        
    db_plan = models.TestPlan(**plan.model_dump())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return _serialize_plan(db_plan)

def get_test_plans(db: Session):
    return [_serialize_plan(p) for p in db.query(models.TestPlan).all()]

def get_test_plan_by_id(db: Session, plan_id: int):
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
    return _serialize_plan(plan)

def update_test_plan(db: Session, plan_id: int, data: schemas.TestPlanCreate):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Plan başlığı boş olamaz.")
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
        
    for k, v in data.model_dump().items():
        setattr(plan, k, v)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)

def delete_test_plan(db: Session, plan_id: int):
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
    db.delete(plan)
    db.commit()
    return {"message": "Test planı silindi."}

# ── TEST PLAN ITEMS İŞLEMLERİ ──
def bulk_add_to_plan(db: Session, plan_id: int, request: schemas.BulkAddRequest):
    try:
        plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Test planı bulunamadı.")

        added_count = 0
        for tc_id in request.test_case_ids:
            existing_item = db.query(models.TestPlanItem).filter(
                models.TestPlanItem.plan_id == plan_id,
                models.TestPlanItem.test_case_id == tc_id
            ).first()

            if not existing_item:
                new_item = models.TestPlanItem(plan_id=plan_id, test_case_id=tc_id, run_status="Bekliyor")
                db.add(new_item)
                added_count += 1

        db.commit()
        return {"message": f"{added_count} adet test senaryosu plana başarıyla eklendi."}
    except Exception as e:
        db.rollback() 
        raise HTTPException(status_code=500, detail=str(e))

def add_item_to_plan(db: Session, plan_id: int, tc_id: int):
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
    if not isinstance(tc_id, int):
        raise HTTPException(status_code=422, detail="Geçerli bir test_case_id gerekli.")
    if db.query(models.TestPlanItem).filter_by(plan_id=plan_id, test_case_id=tc_id).first():
        raise HTTPException(status_code=400, detail="Bu test case zaten bu plana ekli.")
    if not db.query(TestCase).filter(TestCase.id == tc_id).first():
        raise HTTPException(status_code=404, detail="Test case bulunamadı.")
        
    db.add(models.TestPlanItem(plan_id=plan_id, test_case_id=tc_id))
    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)

def remove_item_from_plan(db: Session, plan_id: int, item_id: int):
    item = db.query(models.TestPlanItem).filter_by(id=item_id, plan_id=plan_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı.")
    db.delete(item)
    db.commit()
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    return _serialize_plan(plan)

def update_item_status(db: Session, plan_id: int, item_id: int, body: schemas.TestPlanItemUpdate):
    item = db.query(models.TestPlanItem).filter_by(id=item_id, plan_id=plan_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı.")
    item.run_status = body.run_status
    item.note       = body.note
    db.commit()
    db.refresh(item)
    return {
        "id":                  item.id,
        "test_case_id":        item.test_case_id,
        "run_status":          item.run_status,
        "note":                item.note,
        "test_case_title":     item.test_case.title    if item.test_case else None,
        "test_case_priority":  item.test_case.priority if item.test_case else None,
    }