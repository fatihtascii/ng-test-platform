from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from app.core.deps import get_db, require_permission
from . import schemas, service

router = APIRouter(prefix="/test-cases", tags=["Test Cases"])


# ── BULK ENDPOINT'LER ─────────────────────────────────────────────
# FIX: /{tc_id} path'lerinden ÖNCE tanımlanmalı.
# Aksi hâlde FastAPI "bulk" kelimesini int id olarak parse etmeye çalışır → 422.

@router.post(
    "/bulk/delete", dependencies=[Depends(require_permission("test_cases.delete"))],
    status_code=status.HTTP_200_OK,
    summary="Toplu test senaryosu sil",
)
def bulk_delete_test_cases(
    data: schemas.TestCaseBulkDelete,
    db: Session = Depends(get_db),
):
    # FIX: Boş liste gönderilirse servis gereksiz yere çalışmasın
    if not data.ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Silinecek en az bir ID gönderilmelidir.",
        )
    return service.bulk_delete_test_cases(db, data.ids)


@router.patch(
    "/bulk/status", dependencies=[Depends(require_permission("test_cases.edit"))],
    status_code=status.HTTP_200_OK,
    summary="Toplu durum güncelle",
)
def bulk_update_test_cases_status(
    data: schemas.TestCaseBulkUpdateStatus,
    db: Session = Depends(get_db),
):
    # FIX: Boş liste kontrolü
    if not data.ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Güncellenecek en az bir ID gönderilmelidir.",
        )
    return service.bulk_update_test_cases_status(db, data.ids, data.status)


# FIX: /generate-bdd-code da /{tc_id}'den önce olmalı — aynı "bulk" mantığı.
# "generate-bdd-code" string'ini FastAPI int olarak okuyamaz ama yine de
# önde tutmak best practice ve gelecekteki route çakışmalarını önler.
@router.post(
    "/generate-bdd-code", dependencies=[Depends(require_permission("test_cases.create"))],
    response_model=schemas.BDDGenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Gherkin'den Pytest-BDD kodu üret",
)
def generate_bdd_code(data: schemas.BDDGenerateRequest):
    # FIX: db bağımlılığı yok — saf hesaplama, doğru tasarım.
    # Boş gherkin gönderilirse erken hata dön.
    if not data.gherkin or not data.gherkin.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Gherkin senaryosu boş olamaz.",
        )
    return service.generate_bdd_code(data.gherkin)


# ── STANDART CRUD ─────────────────────────────────────────────────

@router.get(
    "/", dependencies=[Depends(require_permission("test_cases.view"))],
    response_model=list[schemas.TestCaseResponse],
    summary="Tüm test senaryolarını getir",
)
def get_test_cases(
    db: Session = Depends(get_db),
    # FIX: Büyük projelerde GET / tüm kayıtları döndürüyor — potansiyel memory/timeout sorunu.
    # Temel filtreleme query param'ları eklendi; servis katmanı bunları işleyebilir.
    project_id:     Optional[int] = Query(None, description="Projeye göre filtrele"),
    execution_type: Optional[str] = Query(None, description="Manual veya Automated"),
    status:         Optional[str] = Query(None, alias="status", description="Durum filtresi"),
    skip:           int           = Query(0,    ge=0,           description="Kaç kayıt atla"),
    limit:          int           = Query(500,  ge=1, le=1000,  description="Max kayıt sayısı"),
):
    return service.get_test_cases(
        db,
        project_id=project_id,
        execution_type=execution_type,
        status=status,
        skip=skip,
        limit=limit,
    )


@router.post(
    "/", dependencies=[Depends(require_permission("test_cases.create"))],
    response_model=schemas.TestCaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni test senaryosu oluştur",
)
def create_test_case(
    test_case: schemas.TestCaseCreate,
    db: Session = Depends(get_db),
):
    return service.create_test_case(db, test_case)


@router.get(
    "/{tc_id}", dependencies=[Depends(require_permission("test_cases.view"))],
    response_model=schemas.TestCaseResponse,
    summary="Tek test senaryosu getir",
)
def get_test_case(tc_id: int, db: Session = Depends(get_db)):
    # FIX: Tekli GET endpoint'i hiç yoktu — frontend view panel için gerekli.
    tc = service.get_test_case(db, tc_id)
    if not tc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"#{tc_id} ID'li test senaryosu bulunamadı.",
        )
    return tc


@router.get(
    "/{tc_id}/history",
    dependencies=[Depends(require_permission("test_cases.view")), Depends(require_permission("test_runs.view"))],
    summary="Case'in koşum geçmişi ve bağlı hatalar",
)
def get_test_case_history(tc_id: int, db: Session = Depends(get_db)):
    return service.get_test_case_history(db, tc_id)


@router.put(
    "/{tc_id}", dependencies=[Depends(require_permission("test_cases.edit"))],
    response_model=schemas.TestCaseResponse,
    summary="Test senaryosunu güncelle",
)
def update_test_case(
    tc_id: int,
    data: schemas.TestCaseCreate,  # FIX: İdealde TestCaseUpdate (partial) schema olmalı
    db: Session = Depends(get_db),
):
    tc = service.update_test_case(db, tc_id, data)
    if not tc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"#{tc_id} ID'li test senaryosu bulunamadı.",
        )
    return tc


@router.delete(
    "/{tc_id}", dependencies=[Depends(require_permission("test_cases.delete"))],
    status_code=status.HTTP_204_NO_CONTENT,  # FIX: Silme işlemi 204 döndürmeli, 200 değil
    summary="Test senaryosunu sil",
)
def delete_test_case(tc_id: int, db: Session = Depends(get_db)):
    deleted = service.delete_test_case(db, tc_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"#{tc_id} ID'li test senaryosu bulunamadı.",
        )
    # FIX: 204 No Content — body döndürülmemeli