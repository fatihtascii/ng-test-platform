"""
Commit sonrası işler: servis katmanı `on_commit(db, fn, *args)` ile iş kaydeder; işlem başarıyla
commit edilince iş arka planda çalışır, geri alınırsa atılır. Böylece Slack/Jira gecikmesi isteği
yavaşlatmaz ve geri alınan bir kayıt için bildirim gitmez.

Testlerde NG_SYNC_HOOKS=1 ile işler aynı iş parçacığında, sırayla çalışır.
"""
import logging
import os
import threading

from sqlalchemy import event
from sqlalchemy.orm import Session

logger = logging.getLogger("ng-test.hooks")
_KEY = "ng_after_commit"


def sync_mode() -> bool:
    return os.getenv("NG_SYNC_HOOKS") == "1"


def on_commit(db: Session, fn, *args):
    db.info.setdefault(_KEY, []).append((fn, args))


def _run(fn, args):
    try:
        fn(*args)
    except Exception as e:      # bir entegrasyon hatası asıl işlemi asla bozmasın
        logger.error(f"Commit sonrası iş başarısız ({getattr(fn, '__name__', fn)}): {e}", exc_info=True)


def dispatch(fn, *args):
    if sync_mode():
        _run(fn, args)
    else:
        threading.Thread(target=_run, args=(fn, args), daemon=True).start()


@event.listens_for(Session, "after_commit")
def _after_commit(session):
    jobs = session.info.pop(_KEY, [])
    for fn, args in jobs:
        dispatch(fn, *args)


@event.listens_for(Session, "after_rollback")
def _after_rollback(session):
    session.info.pop(_KEY, None)
