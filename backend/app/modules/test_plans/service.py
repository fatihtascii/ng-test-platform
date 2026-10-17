"""
Test Plans service.

DÜZELTMELER:
- bulk_add_to_plan: genel `except Exception` bloğu HTTPException'ı da
  yakalayıp 500'e çeviriyordu. HTTPException tekrar raise ediliyor.
- add_item_to_plan: isinstance(tc_id, int) kontrolü kaldırıldı — router
  artık tip-güvenli schema kullandığından bu kontrol gereksiz ve yanıltıcı.
- _serialize_plan: plan None gelirse None dönmek yerine 404 fırlatıyor
  (remove_item_from_plan sonrası plan silinmişse defensively handle edildi).
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_cases.models import TestCase


def _serialize_plan(plan: models.TestPlan) -> dict:
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
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


def _get_plan_or_404(db: Session, plan_id: int) -> models.TestPlan:
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
    return plan


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
    return _serialize_plan(_get_plan_or_404(db, plan_id))


def update_test_plan(db: Session, plan_id: int, data: schemas.TestPlanCreate):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Plan başlığı boş olamaz.")

    plan = _get_plan_or_404(db, plan_id)
    for k, v in data.model_dump().items():
        setattr(plan, k, v)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)


def delete_test_plan(db: Session, plan_id: int):
    plan = _get_plan_or_404(db, plan_id)
    db.delete(plan)
    db.commit()
    return {"message": "Test planı silindi."}


def bulk_add_to_plan(db: Session, plan_id: int, request: schemas.BulkAddRequest):
    plan = _get_plan_or_404(db, plan_id)

    # FIX: HTTPException'ı genel except yakalamıyordu, ayrı re-raise eklendi
    added_count = 0
    try:
        for tc_id in request.test_case_ids:
            existing = db.query(models.TestPlanItem).filter_by(
                plan_id=plan_id, test_case_id=tc_id
            ).first()
            if not existing:
                db.add(models.TestPlanItem(
                    plan_id=plan_id,
                    test_case_id=tc_id,
                    run_status="Bekliyor",
                ))
                added_count += 1
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": f"{added_count} adet test senaryosu plana başarıyla eklendi."}


def add_item_to_plan(db: Session, plan_id: int, tc_id: int):
    _get_plan_or_404(db, plan_id)

    if not db.query(TestCase).filter(TestCase.id == tc_id).first():
        raise HTTPException(status_code=404, detail="Test case bulunamadı.")
    if db.query(models.TestPlanItem).filter_by(
        plan_id=plan_id, test_case_id=tc_id
    ).first():
        raise HTTPException(status_code=400, detail="Bu test case zaten bu plana ekli.")

    db.add(models.TestPlanItem(plan_id=plan_id, test_case_id=tc_id))
    db.commit()

    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    return _serialize_plan(plan)


def remove_item_from_plan(db: Session, plan_id: int, item_id: int):
    item = db.query(models.TestPlanItem).filter_by(
        id=item_id, plan_id=plan_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı.")
    db.delete(item)
    db.commit()

    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    return _serialize_plan(plan)


def update_item_status(
    db: Session,
    plan_id: int,
    item_id: int,
    body: schemas.TestPlanItemUpdate,
):
    item = db.query(models.TestPlanItem).filter_by(
        id=item_id, plan_id=plan_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı.")

    item.run_status = body.run_status
    item.note       = body.note
    db.commit()
    db.refresh(item)

    return {
        "id":                 item.id,
        "test_case_id":       item.test_case_id,
        "run_status":         item.run_status,
        "note":               item.note,
        "test_case_title":    item.test_case.title    if item.test_case else None,
        "test_case_priority": item.test_case.priority if item.test_case else None,
    }
