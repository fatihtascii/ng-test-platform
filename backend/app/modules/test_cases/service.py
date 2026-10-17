import re
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from . import models, schemas
from app.modules.projects.models import Project

logger = logging.getLogger("ng-test.test_cases")


# ── Yardımcı: 404 fırlat ─────────────────────────────────────────
def _get_or_404(db: Session, tc_id: int) -> models.TestCase:
    """
    FIX: Aynı 'bulunamazsa 404 fırlat' bloğu her fonksiyonda tekrarlanıyordu.
    DRY prensibine uygun merkezi yardımcı.
    """
    tc = db.query(models.TestCase).filter(models.TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"#{tc_id} ID'li test senaryosu bulunamadı.",
        )
    return tc


# ── Yardımcı: Proje varlık kontrolü ──────────────────────────────
def _assert_project_exists(db: Session, project_id: int) -> None:
    """
    FIX: Proje kontrolü create'de vardı ama update'de yoktu.
    Merkezi fonksiyon her ikisinde de kullanılıyor.
    """
    exists = db.query(Project.id).filter(Project.id == project_id).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"#{project_id} ID'li proje bulunamadı.",
        )


# ── CREATE ────────────────────────────────────────────────────────
def create_test_case(db: Session, test_case: schemas.TestCaseCreate) -> models.TestCase:
    # FIX: title.strip() kontrolü schema validator'da yapılıyor artık.
    # Burada tekrar kontrol etmek katmanları karıştırır — kaldırıldı.

    _assert_project_exists(db, test_case.project_id)

    # FIX: model_dump() tüm alanları tek seferde geçirir — güvenli ve DRY.
    db_tc = models.TestCase(**test_case.model_dump())
    db.add(db_tc)

    try:
        db.commit()
        db.refresh(db_tc)
    except Exception as e:
        db.rollback()
        logger.error(f"TestCase oluşturulamadı: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Test senaryosu kaydedilemedi.",
        )

    logger.info(f"TestCase oluşturuldu: id={db_tc.id} title={db_tc.title!r}")
    return db_tc


# ── GET ALL ───────────────────────────────────────────────────────
def get_test_cases(
    db: Session,
    project_id:     Optional[int] = None,
    execution_type: Optional[str] = None,
    status:         Optional[str] = None,
    skip:           int = 0,
    limit:          int = 500,
) -> list[models.TestCase]:
    """
    FIX: Orijinal versiyon tüm kayıtları döndürüyordu (limit yoktu).
    Büyük projelerde bellek ve timeout sorununa yol açar.
    Router'dan gelen filtre parametreleri burada uygulanıyor.
    """
    q = db.query(models.TestCase)

    if project_id is not None:
        q = q.filter(models.TestCase.project_id == project_id)
    if execution_type is not None:
        q = q.filter(models.TestCase.execution_type == execution_type)
    if status is not None:
        q = q.filter(models.TestCase.status == status)

    return (
        q.order_by(models.TestCase.id.desc())
         .offset(skip)
         .limit(limit)
         .all()
    )


# ── GET ONE ───────────────────────────────────────────────────────
def get_test_case(db: Session, tc_id: int) -> models.TestCase:
    """
    FIX: Orijinal kodda tekil GET servisi hiç yoktu.
    Router'daki GET /{tc_id} endpoint'i bunu çağırıyor.
    """
    return _get_or_404(db, tc_id)


# ── UPDATE ────────────────────────────────────────────────────────
def update_test_case(
    db: Session,
    tc_id: int,
    data: schemas.TestCaseCreate,
) -> models.TestCase:
    # FIX: title.strip() kontrolü schema'da yapılıyor — kaldırıldı.

    tc = _get_or_404(db, tc_id)

    # FIX: project_id değiştiriliyorsa yeni proje de kontrol edilmeli.
    if data.project_id != tc.project_id:
        _assert_project_exists(db, data.project_id)

    # FIX: model_dump(exclude_unset=True) yerine tüm alanları set ediyoruz
    # çünkü bu PUT endpoint'i (tam güncelleme). PATCH için exclude_unset kullanılır.
    for key, value in data.model_dump().items():
        setattr(tc, key, value)

    try:
        db.commit()
        db.refresh(tc)
    except Exception as e:
        db.rollback()
        logger.error(f"TestCase güncellenemedi id={tc_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Test senaryosu güncellenemedi.",
        )

    logger.info(f"TestCase güncellendi: id={tc.id}")
    return tc


# ── DELETE ────────────────────────────────────────────────────────
def delete_test_case(db: Session, tc_id: int) -> bool:
    """
    FIX: Orijinal versiyon dict döndürüyordu.
    Router 204 No Content döndürdüğü için servis sadece bool döndürmeli.
    Router zaten 404 kontrolünü yapıyor — burada _get_or_404 kullanıyoruz
    ama router'daki None kontrolü de tutarlı çalışır.
    """
    tc = _get_or_404(db, tc_id)
    db.delete(tc)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"TestCase silinemedi id={tc_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Test senaryosu silinemedi.",
        )

    logger.info(f"TestCase silindi: id={tc_id}")
    return True


# ── BULK DELETE ───────────────────────────────────────────────────
def bulk_delete_test_cases(db: Session, ids: list[int]) -> dict:
    """
    FIX: Orijinal versiyon gerçekte kaç kaydın silindiğini bildirmiyordu.
    ids içinde olmayan ID'ler sessizce görmezden geliniyordu.
    Şimdi gerçek silinen sayısı döndürülüyor.
    """
    # FIX: ids içinde duplicate varsa temizle
    unique_ids = list(set(ids))

    deleted_count = (
        db.query(models.TestCase)
        .filter(models.TestCase.id.in_(unique_ids))
        .delete(synchronize_session=False)
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk delete başarısız: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Toplu silme işlemi tamamlanamadı.",
        )

    # FIX: İstenen ile silinen sayı farklıysa uyarı logla
    if deleted_count != len(unique_ids):
        logger.warning(
            f"Bulk delete: {len(unique_ids)} ID istendi, {deleted_count} silindi. "
            "Bazı ID'ler mevcut değildi."
        )

    logger.info(f"Bulk delete: {deleted_count} TestCase silindi.")
    return {"deleted": deleted_count, "requested": len(unique_ids)}


# ── BULK STATUS UPDATE ────────────────────────────────────────────
def bulk_update_test_cases_status(
    db: Session,
    ids: list[int],
    new_status: str,
) -> dict:
    """
    FIX: Parametre adı 'status' idi — Python built-in 'status' ile gölgeleme riski.
    'new_status' olarak yeniden adlandırıldı.

    FIX: Gerçekte kaç kaydın güncellendiği döndürülüyor.
    """
    unique_ids = list(set(ids))

    updated_count = (
        db.query(models.TestCase)
        .filter(models.TestCase.id.in_(unique_ids))
        .update({"status": new_status}, synchronize_session=False)
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk status update başarısız: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Toplu durum güncelleme işlemi tamamlanamadı.",
        )

    if updated_count != len(unique_ids):
        logger.warning(
            f"Bulk status update: {len(unique_ids)} ID istendi, {updated_count} güncellendi."
        )

    logger.info(f"Bulk status update: {updated_count} TestCase -> '{new_status}'")
    return {"updated": updated_count, "requested": len(unique_ids), "status": new_status}


# ── BDD KOD ÜRETICI ───────────────────────────────────────────────
# Türkçe → ASCII (fonksiyon/dosya adları için). Önceki tablo kaymıştı: ö→s, ş→o, ü→s.
_TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")

# İngilizce ve Türkçe Gherkin anahtar kelimeleri (uzun olan önce eşleşsin)
_STEP_KEYWORDS = [
    ("given", ("given ", "diyelim ki ", "varsayalım ki ")),
    ("when",  ("when ", "eğer ki ", "eğer ")),
    ("then",  ("then ", "o zaman ")),
    ("and",   ("and ", "but ", "ve ", "fakat ", "ama ")),
]
_FEATURE_KEYS  = ("feature:", "özellik:")
_SCENARIO_KEYS = ("scenario outline:", "senaryo taslağı:", "scenario:", "senaryo:")


def _tr_lower(text: str) -> str:
    # Python'un lower()'ı "I"yı "i" yapar; Türkçe için I→ı, İ→i olmalı
    return text.replace("I", "ı").replace("İ", "i").lower()


def generate_bdd_code(gherkin_text: str) -> dict:
    """Gherkin metninden pytest-bdd feature dosyası ve step iskeleti üretir."""
    lines = [l.strip() for l in gherkin_text.strip().splitlines() if l.strip() and not l.strip().startswith("#")]

    feature_name  = "Senaryo"
    scenario_name = "Test Senaryosu"
    steps: dict[str, list[str]] = {"given": [], "when": [], "then": []}
    current = None
    turkish = False

    for line in lines:
        low = _tr_lower(line)
        if low.startswith(("özellik:", "senaryo:", "senaryo taslağı:", "diyelim ki ", "varsayalım ki ",
                           "eğer ", "o zaman ", "ve ", "fakat ", "ama ")):
            turkish = True
        if low.startswith(_FEATURE_KEYS):
            feature_name = line.split(":", 1)[1].strip() or feature_name
            continue
        if low.startswith(_SCENARIO_KEYS):
            scenario_name = line.split(":", 1)[1].strip() or scenario_name
            continue
        for kind, prefixes in _STEP_KEYWORDS:
            prefix = next((p for p in prefixes if low.startswith(p)), None)
            if prefix:
                text = line[len(prefix):].strip()
                if kind != "and":
                    current = kind
                # Aynı adım metni için tek step tanımı yeterli (pytest-bdd metinle eşler)
                if current and text not in steps[current]:
                    steps[current].append(text)
                break

    def to_slug(text: str) -> str:
        ascii_text = _tr_lower(text).translate(_TR_MAP)
        return re.sub(r"[^a-z0-9]+", "_", ascii_text)[:50].strip("_") or "adim"

    used_names: set[str] = set()

    def unique_name(base: str) -> str:
        name, n = base, 2
        while name in used_names:
            name, n = f"{base}_{n}", n + 1
        used_names.add(name)
        return name

    def to_step_defs(items: list[str], decorator: str) -> str:
        parts = []
        for text in items:
            func = unique_name(f"{decorator}_{to_slug(text)}")
            parts.append(f"@{decorator}({text!r})")      # repr → tırnaklar güvenle kaçırılır
            parts.append(f"def {func}():")
            parts.append("    pass  # TODO: adımı uygula")
            parts.append("")
        return "\n".join(parts)

    feature_slug  = to_slug(feature_name)
    scenario_slug = to_slug(scenario_name)
    scenario_lines = [l for l in lines if not _tr_lower(l).startswith(_FEATURE_KEYS + _SCENARIO_KEYS)]

    # Türkçe anahtar kelimeler pytest-bdd'de "# language: tr" başlığıyla çalışır
    feature_kw, scenario_kw = ("Özellik", "Senaryo") if turkish else ("Feature", "Scenario")
    feature_file = (
        f"# {feature_slug}.feature\n"
        + ("# language: tr\n" if turkish else "")
        + f"{feature_kw}: {feature_name}\n\n"
        f"  {scenario_kw}: {scenario_name}\n"
        + "\n".join(f"    {l}" for l in scenario_lines)
        + "\n"
    )

    step_defs = (
        f"# steps/test_{scenario_slug}.py\n"
        "from pytest_bdd import scenario, given, when, then\n\n\n"
        f"@scenario({feature_slug + '.feature'!r}, {scenario_name!r})\n"
        f"def test_{scenario_slug}():\n"
        "    pass\n\n\n"
        + "\n".join(filter(None, (
            to_step_defs(steps["given"], "given"),
            to_step_defs(steps["when"], "when"),
            to_step_defs(steps["then"], "then"),
        )))
    )

    if not any(steps.values()):
        logger.warning("generate_bdd_code: Hiç Given/When/Then adımı parse edilemedi.")

    return {"code": f"# === FEATURE FILE ===\n{feature_file}\n\n# === STEP DEFINITIONS ===\n{step_defs}"}
