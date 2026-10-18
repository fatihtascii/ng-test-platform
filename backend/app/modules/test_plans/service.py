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
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException
from . import models, schemas
from app.modules.projects.models import Project
from app.modules.test_cases.models import TestCase


def item_dict(item) -> dict:
    tc = item.test_case
    return {
        "id":                 item.id,
        "test_case_id":       item.test_case_id,
        "run_status":         item.run_status,
        "note":               item.note,
        "test_case_title":    tc.title    if tc else None,
        "test_case_priority": tc.priority if tc else None,
        "test_case_execution_type": tc.execution_type if tc else None,
        # Otomasyonda koşulabilir mi (script'i ya da depodaki testi var) ve hangi depodan
        "test_case_automatable": bool(tc and tc.execution_type == "Automated"
                                      and ((tc.automation_script or "").strip() or tc.automation_ref)),
        "test_case_suite_id": tc.suite_id if tc else None,
    }

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
            item_dict(item) for item in sorted(plan.items, key=lambda i: i.id)
        ],
    }


def _get_plan_or_404(db: Session, plan_id: int) -> models.TestPlan:
    plan = db.query(models.TestPlan).filter(models.TestPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Test planı bulunamadı.")
    return plan


def create_test_plan(db: Session, plan: schemas.TestPlanCreate):
    if not db.query(Project).filter(Project.id == plan.project_id).first():
        raise HTTPException(status_code=404, detail="Proje bulunamadı.")

    db_plan = models.TestPlan(**plan.model_dump())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return _serialize_plan(db_plan)


def get_test_plans(db: Session):
    # items ve case'leri tek seferde yükle (plan başına ayrı sorgu atılmasın)
    plans = (db.query(models.TestPlan)
               .options(selectinload(models.TestPlan.items).selectinload(models.TestPlanItem.test_case))
               .order_by(models.TestPlan.id.desc())
               .all())
    return [_serialize_plan(p) for p in plans]


def get_test_plan_by_id(db: Session, plan_id: int):
    return _serialize_plan(_get_plan_or_404(db, plan_id))


def update_test_plan(db: Session, plan_id: int, data: schemas.TestPlanCreate):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Plan başlığı boş olamaz.")

    plan = _get_plan_or_404(db, plan_id)
    if data.project_id != plan.project_id:
        if not db.query(Project).filter(Project.id == data.project_id).first():
            raise HTTPException(status_code=404, detail="Proje bulunamadı.")
        if plan.items:
            raise HTTPException(status_code=400,
                detail="Plana eklenmiş test case'ler varken plan başka projeye taşınamaz.")
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

    # Tekrarlı ID'leri ayıkla (aynı istekte iki kez gelince unique ihlali → 500 oluyordu)
    requested = list(dict.fromkeys(request.test_case_ids))
    if not requested:
        raise HTTPException(status_code=422, detail="En az bir test case seçilmelidir.")

    cases = {c.id: c for c in db.query(TestCase).filter(TestCase.id.in_(requested)).all()}
    missing = [i for i in requested if i not in cases]
    if missing:
        raise HTTPException(status_code=404, detail=f"Test case bulunamadı: {missing}")
    other_project = [i for i in requested if cases[i].project_id != plan.project_id]
    if other_project:
        raise HTTPException(status_code=400,
            detail=f"Şu test case'ler planın projesine ait değil: {other_project}")

    already = {
        row[0] for row in db.query(models.TestPlanItem.test_case_id)
        .filter(models.TestPlanItem.plan_id == plan_id,
                models.TestPlanItem.test_case_id.in_(requested))
    }
    to_add = [i for i in requested if i not in already]
    for tc_id in to_add:
        db.add(models.TestPlanItem(plan_id=plan_id, test_case_id=tc_id, run_status="Bekliyor"))
    db.commit()

    return {
        "message": f"{len(to_add)} adet test senaryosu plana başarıyla eklendi.",
        "added": len(to_add),
        "skipped": len(already),
    }


def add_item_to_plan(db: Session, plan_id: int, tc_id: int):
    plan = _get_plan_or_404(db, plan_id)

    tc = db.query(TestCase).filter(TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case bulunamadı.")
    if tc.project_id != plan.project_id:
        raise HTTPException(status_code=400, detail="Test case planın projesine ait değil.")
    if db.query(models.TestPlanItem).filter_by(
        plan_id=plan_id, test_case_id=tc_id
    ).first():
        raise HTTPException(status_code=400, detail="Bu test case zaten bu plana ekli.")

    db.add(models.TestPlanItem(plan_id=plan_id, test_case_id=tc_id))
    db.commit()
    db.refresh(plan)   # expire_on_commit=False olduğu için items listesini tazele
    return _serialize_plan(plan)


def remove_item_from_plan(db: Session, plan_id: int, item_id: int):
    item = db.query(models.TestPlanItem).filter_by(
        id=item_id, plan_id=plan_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item bulunamadı.")
    db.delete(item)
    db.commit()

    plan = _get_plan_or_404(db, plan_id)
    db.refresh(plan)
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
    _sync_case_status([item])
    db.commit()
    db.refresh(item)

    return item_dict(item)


# Plan kalemi sonucu, case'in "son sonuç" statüsüne de yansır (koşumlardaki davranışla aynı)
_CASE_STATUS_BY_PLAN = {"Başarılı": "Başarılı", "Başarısız": "Başarısız"}


def _sync_case_status(items) -> None:
    for it in items:
        new = _CASE_STATUS_BY_PLAN.get(it.run_status)
        if new and it.test_case is not None:
            it.test_case.status = new


def bulk_update_item_status(db: Session, plan_id: int, body: schemas.BulkItemStatus):
    plan = _get_plan_or_404(db, plan_id)
    wanted = set(body.item_ids)
    items = [i for i in plan.items if i.id in wanted]
    if not items:
        raise HTTPException(status_code=404, detail="Güncellenecek kalem bulunamadı.")
    for it in items:
        it.run_status = body.run_status
        if body.run_status != "Başarısız":
            it.note = None
    _sync_case_status(items)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)


def bulk_remove_items(db: Session, plan_id: int, body: schemas.BulkItemIds):
    plan = _get_plan_or_404(db, plan_id)
    wanted = set(body.item_ids)
    for it in [i for i in plan.items if i.id in wanted]:
        db.delete(it)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan)
