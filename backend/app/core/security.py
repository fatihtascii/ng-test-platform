"""
JWT token üretimi ve doğrulaması.

Ayarlar (.env):
  JWT_SECRET_KEY       — zorunlu (production). Geliştirmede yoksa süreç başına
                         rastgele üretilir; backend yeniden başlayınca oturumlar düşer.
  JWT_EXPIRE_MINUTES   — token ömrü, varsayılan 480 (8 saat).
"""
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("ng-test.security")

ALGORITHM = "HS256"

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    if os.getenv("APP_ENV", "development") == "production":
        raise RuntimeError("Production ortamında JWT_SECRET_KEY zorunludur.")
    SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning(
        "JWT_SECRET_KEY tanımlı değil — geçici anahtar üretildi. "
        "Backend yeniden başlayınca tüm oturumlar düşer. .env dosyasına ekleyin."
    )

try:
    EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
except ValueError:
    EXPIRE_MINUTES = 480


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Geçerliyse payload, değilse None döner."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access" or not payload.get("sub"):
        return None
    return payload
