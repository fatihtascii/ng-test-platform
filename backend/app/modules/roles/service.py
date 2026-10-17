"""
Roles & Permissions service.

DÜZELTMELER:
- update_role: is_system=True olan rollerin display_name/description/color
  güncellemesine izin veriliyor ama name ve is_system alanı değiştirilemiyor.
  Önceki versiyonda sistem rolleri de serbestçe güncellenebiliyordu.
- seed_rbac: commit öncesi flush eklendi, böylece aynı transaction içinde
  role.id kullanılabiliyor (eski kodda da vardı, korundu).
- update_role_permissions: Admin rolünün tüm izinleri kaldırılmasını engelle.
"""
import re
import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas
from app.modules.users.models import User

logger = logging.getLogger("ng-test.rbac")

# ── SEED DATA ─────────────────────────────────────────────────────
DEFAULT_PERMISSIONS = [
    {"key": "projects.view",       "name": "Projeleri Gör",      "module": "projects",      "description": "Projeleri listele ve detay gör"},
    {"key": "projects.create",     "name": "Proje Oluştur",      "module": "projects",      "description": "Yeni proje ekle"},
    {"key": "projects.edit",       "name": "Proje Düzenle",      "module": "projects",      "description": "Projeleri güncelle"},
    {"key": "projects.delete",     "name": "Proje Sil",          "module": "projects",      "description": "Projeleri sil"},
    {"key": "test_cases.view",     "name": "Test Case Gör",      "module": "test_cases",    "description": "Test senaryolarını görüntüle"},
    {"key": "test_cases.create",   "name": "Test Case Ekle",     "module": "test_cases",    "description": "Yeni senaryo oluştur"},
    {"key": "test_cases.edit",     "name": "Test Case Düzenle",  "module": "test_cases",    "description": "Senaryoları güncelle"},
    {"key": "test_cases.delete",   "name": "Test Case Sil",      "module": "test_cases",    "description": "Senaryoları sil"},
    {"key": "test_runs.view",      "name": "Koşumları Gör",      "module": "test_runs",     "description": "Koşumları görüntüle"},
    {"key": "test_runs.create",    "name": "Koşum Başlat",       "module": "test_runs",     "description": "Yeni koşum oluştur"},
    {"key": "test_runs.execute",   "name": "Koşum Çalıştır",     "module": "test_runs",     "description": "Test runner kullan"},
    {"key": "test_runs.delete",    "name": "Koşum Sil",          "module": "test_runs",     "description": "Koşumları sil"},
    {"key": "test_plans.view",     "name": "Planları Gör",       "module": "test_plans",    "description": "Test planlarını görüntüle"},
    {"key": "test_plans.create",   "name": "Plan Oluştur",       "module": "test_plans",    "description": "Yeni plan ekle"},
    {"key": "test_plans.edit",     "name": "Plan Düzenle",       "module": "test_plans",    "description": "Planları güncelle"},
    {"key": "test_plans.delete",   "name": "Plan Sil",           "module": "test_plans",    "description": "Planları sil"},
    {"key": "defects.view",        "name": "Hataları Gör",       "module": "defects",       "description": "Hata kayıtlarını görüntüle"},
    {"key": "defects.manage",      "name": "Hata Yönet",         "module": "defects",       "description": "Statü güncelle"},
    {"key": "users.view",          "name": "Kullanıcıları Gör",  "module": "users",         "description": "Kullanıcı listesini gör"},
    {"key": "users.manage",        "name": "Kullanıcı Yönet",    "module": "users",         "description": "Kullanıcı düzenle, sil, rol ata"},
    {"key": "reports.view",        "name": "Raporları Gör",      "module": "reports",       "description": "Raporları görüntüle"},
    {"key": "reports.export",      "name": "Rapor İndir",        "module": "reports",       "description": "PDF/Excel export al"},
    {"key": "automation.view",     "name": "Otomasyonu Gör",     "module": "automation",    "description": "Otomasyon sayfasını gör"},
    {"key": "automation.execute",  "name": "Otomasyon Çalıştır", "module": "automation",    "description": "Otomasyon testleri başlat"},
    {"key": "environments.view",   "name": "Ortamları Gör",      "module": "environments",  "description": "Ortam ve değişkenleri gör"},
    {"key": "environments.manage", "name": "Ortam Yönet",        "module": "environments",  "description": "Ortam/değişken ekle/sil"},
    {"key": "roles.view",          "name": "Rolleri Gör",        "module": "roles",         "description": "Rol listesini görüntüle"},
    {"key": "roles.manage",        "name": "Rol Yönet",          "module": "roles",         "description": "Rol ve izin yönetimi"},
    {"key": "integrations.view",   "name": "Entegrasyonları Gör", "module": "integrations", "description": "Slack/Jira/GitHub ayarlarını gör"},
    {"key": "integrations.manage", "name": "Entegrasyon Yönet",  "module": "integrations",  "description": "Entegrasyon ayarlarını değiştir ve test et"},
]

DEFAULT_ROLES = [
    {"name": "admin",   "display_name": "Admin",           "color": "rose",   "is_system": True, "description": "Tüm işlemlere tam erişim.",   "permissions": "*"},
    {"name": "manager", "display_name": "Test Yöneticisi", "color": "amber",  "is_system": True, "description": "Projeleri yönetir.",          "permissions": ["projects.view","projects.create","projects.edit","test_cases.view","test_cases.create","test_cases.edit","test_cases.delete","test_runs.view","test_runs.create","test_runs.execute","test_runs.delete","test_plans.view","test_plans.create","test_plans.edit","test_plans.delete","defects.view","defects.manage","users.view","reports.view","reports.export","automation.view","automation.execute","environments.view","environments.manage","roles.view"]},
    {"name": "tester",  "display_name": "Test Uzmanı",     "color": "indigo", "is_system": True, "description": "Koşum yapabilir.",            "permissions": ["projects.view","test_cases.view","test_cases.create","test_cases.edit","test_runs.view","test_runs.create","test_runs.execute","test_plans.view","defects.view","defects.manage","reports.view","automation.view","environments.view"]},
    {"name": "viewer",  "display_name": "İzleyici",        "color": "slate",  "is_system": True, "description": "Sadece okuma yetkisi.",       "permissions": ["projects.view","test_cases.view","test_runs.view","test_plans.view","defects.view","reports.view","environments.view"]},
]


def seed_rbac(db: Session):
    for pdata in DEFAULT_PERMISSIONS:
        if not db.query(models.Permission).filter_by(key=pdata["key"]).first():
            db.add(models.Permission(**pdata))
    db.commit()

    all_permissions = db.query(models.Permission).all()
    perm_map = {p.key: p for p in all_permissions}

    for rdata in DEFAULT_ROLES:
        existing = db.query(models.Role).filter_by(name=rdata["name"]).first()
        if existing:
            # Admin rolü sonradan eklenen izinleri de otomatik alır
            if rdata["permissions"] == "*":
                linked = {rp.permission_id for rp in existing.permissions}
                for perm in all_permissions:
                    if perm.id not in linked:
                        db.add(models.RolePermission(role_id=existing.id, permission_id=perm.id))
            continue
        role = models.Role(
            name=rdata["name"],
            display_name=rdata["display_name"],
            color=rdata["color"],
            is_system=rdata["is_system"],
            description=rdata["description"],
        )
        db.add(role)
        db.flush()
        perms = (
            all_permissions
            if rdata["permissions"] == "*"
            else [perm_map[k] for k in rdata["permissions"] if k in perm_map]
        )
        for perm in perms:
            db.add(models.RolePermission(role_id=role.id, permission_id=perm.id))
    db.commit()
    logger.info("RBAC seed tamamlandı.")


# ── PERMISSIONS ───────────────────────────────────────────────────

def get_permissions(db: Session):
    return db.query(models.Permission).all()


# ── ROLES ─────────────────────────────────────────────────────────

def get_roles(db: Session):
    return db.query(models.Role).all()


def create_role(db: Session, role: schemas.RoleCreate):
    if not role.name.strip() or not role.display_name.strip():
        raise HTTPException(status_code=400, detail="Rol adı ve görünen ad boş olamaz.")
    if not re.match(r"^[a-z0-9_]{2,30}$", role.name):
        raise HTTPException(
            status_code=400,
            detail="Rol anahtarı küçük harf, rakam ve _ içerebilir (2-30 karakter).",
        )
    if db.query(models.Role).filter(models.Role.name == role.name).first():
        raise HTTPException(status_code=400, detail="Bu rol adı zaten mevcut.")

    db_role = models.Role(**role.model_dump())
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role


def update_role(db: Session, role_id: int, data: schemas.RoleUpdate):
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol bulunamadı.")

    # FIX: Sistem rolleri için yalnızca görsel alanlar (display_name, description, color)
    # güncellenebilir. name ve is_system değiştirilemez.
    allowed_for_system = {"display_name", "description", "color"}
    update_data = data.model_dump(exclude_none=True)

    if role.is_system:
        forbidden = set(update_data.keys()) - allowed_for_system
        if forbidden:
            raise HTTPException(
                status_code=400,
                detail=f"Sistem rolünde şu alanlar değiştirilemez: {sorted(forbidden)}",
            )

    for k, v in update_data.items():
        setattr(role, k, v)

    db.commit()
    db.refresh(role)
    return role


def delete_role(db: Session, role_id: int):
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol bulunamadı.")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Sistem rolleri silinemez.")

    assigned = db.query(User).filter(User.role == role.name).count()
    if assigned > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Bu role atanmış {assigned} kullanıcı var. Önce kullanıcıların rolünü değiştirin.",
        )

    db.delete(role)
    db.commit()
    return {"message": "Rol silindi."}


def update_role_permissions(db: Session, role_id: int, data: schemas.RolePermissionUpdate):
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol bulunamadı.")

    # FIX: Admin rolünün tüm izinleri kaldırılmasını engelle
    if role.name == "admin" and not data.permission_ids:
        raise HTTPException(
            status_code=400,
            detail="Admin rolünün tüm izinleri kaldırılamaz.",
        )

    valid_ids = {p.id for p in db.query(models.Permission).all()}
    invalid = [pid for pid in data.permission_ids if pid not in valid_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Geçersiz izin ID'leri: {invalid}")

    db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role_id
    ).delete()

    for perm_id in data.permission_ids:
        db.add(models.RolePermission(role_id=role_id, permission_id=perm_id))

    db.commit()
    db.refresh(role)
    return role
