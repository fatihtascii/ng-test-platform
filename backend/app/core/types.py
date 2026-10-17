"""
Ortak SQLAlchemy tipleri.

UTCDateTime: tüm zaman damgaları UTC olarak saklanır ve saat dilimi bilgisiyle (aware)
döner. API yanıtında "2026-10-17T21:30:00+00:00" gibi görünür; tarayıcı yerel saate
(ör. İstanbul, UTC+3) doğru çevirir. Eskiden saat dilimsiz değerler tarayıcıda yerel
saat sanılıyor ve 3 saat kayıyordu.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        # SQLite'ta saat dilimi tutulamaz → UTC olarak saat dilimsiz yaz
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):          # bazı SQLite sürücüleri metin döndürebilir
            value = datetime.fromisoformat(value)
        if value.tzinfo is None:            # SQLite / eski kayıtlar: UTC kabul edilir
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
