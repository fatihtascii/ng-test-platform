"""
İlk admin kullanıcısını oluşturur veya mevcut bir kullanıcıyı admin yapar.

Kullanım (backend klasöründen):
    python create_admin.py <kullanici_adi> [email]
Şifre güvenli şekilde terminalden sorulur.
"""
import sys
import getpass

from app.db.database import SessionLocal, engine
from app.core.base import Base
import app.main  # noqa: F401  — tüm modelleri yükler
from app.modules.users import models, schemas, service
from app.modules.roles.service import seed_rbac


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    username = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 else None

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_rbac(db)
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            user.role = "admin"
            db.commit()
            print(f"'{username}' artık admin.")
            return
        password = getpass.getpass("Şifre: ")
        if password != getpass.getpass("Şifre (tekrar): "):
            print("Şifreler eşleşmiyor."); sys.exit(1)
        service.create_user(
            db,
            schemas.UserCreate(username=username, email=email, password=password, role="admin"),
            is_external=False,
        )
        print(f"Admin kullanıcı oluşturuldu: {username}")
    except Exception as e:
        detail = getattr(e, "detail", e)
        print(f"Hata: {detail}"); sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
