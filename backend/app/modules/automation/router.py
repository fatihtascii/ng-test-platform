"""
Otomasyon koşumu WebSocket'i: /ws/run-test?token=...  (motor: core.py)

İstemci → sunucu:
  1. {"cases": [id...], "browser": "Chrome", "headless": true, "environment_id": 3?, "test_plan_id": 2?}
     (test_plan_id: koşum plana bağlanır, plan kalemlerinin sonucu güncellenir)
  2. (isteğe bağlı) {"type": "stop"} — süreç sonlandırılır, koşum kaydedilmez
Sunucu → istemci:
  {"type": "info|warn|error|success|running", "message", "progress"?}   log satırı
  {"type": "plan", "cases": [{case_id, title, status: queued|skipped, reason?}]}
  {"type": "case", "case_id", "status": running|passed|failed|skipped}
  {"type": "summary", "run_id", "defect", "defects", "counts", "duration"}
  {"type": "stopped", "message"} | {"type": "done", "message"}
Bağlantı koparsa süreç de sonlandırılır (arka planda sahipsiz koşum kalmaz).
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.deps import has_permission, user_from_token
from app.db.database import SessionLocal
from . import core

logger = logging.getLogger("ng-test.automation")
router = APIRouter()


async def send(ws: WebSocket, type_: str, message: str = "", **extra):
    try:
        await ws.send_json({"type": type_, "message": message, **extra})
    except Exception:
        pass


async def _watch_client(ws: WebSocket, stop: asyncio.Event):
    """Koşum sürerken istemciyi dinler: 'stop' mesajı ya da bağlantı kopması koşumu durdurur."""
    try:
        while True:
            msg = await ws.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "stop":
                stop.set()
                return
    except Exception:          # WebSocketDisconnect dahil
        stop.set()


@router.websocket("/ws/run-test")
async def run_test(websocket: WebSocket):
    await websocket.accept()

    db = SessionLocal()
    try:
        user = user_from_token(db, websocket.query_params.get("token"))
        allowed = bool(user) and has_permission(db, user, "automation.execute")
        user_id = user.id if user else None
    finally:
        db.close()
    if not user:
        await send(websocket, "error", "[HATA] Oturum geçersiz. Lütfen tekrar giriş yapın.")
        await websocket.close(code=4401)
        return
    if not allowed:
        await send(websocket, "error", "[HATA] Otomasyon çalıştırma yetkiniz yok (automation.execute).")
        await websocket.close(code=4403)
        return

    watcher = None
    try:
        try:
            config = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
        except asyncio.TimeoutError:
            await send(websocket, "error", "[HATA] Koşum ayarları 30 saniye içinde gelmedi.")
            return
        except Exception as e:
            await send(websocket, "error", f"[HATA] Geçersiz istek: {e}")
            return

        stop = asyncio.Event()
        watcher = asyncio.create_task(_watch_client(websocket, stop))

        async def emit(type_, message="", **extra):
            await send(websocket, type_, message, **extra)

        await core.execute(config, user_id, emit, stop)
    except core.StartError as e:
        await send(websocket, "error", f"[HATA] {e}")
    except WebSocketDisconnect:
        logger.info("İstemci bağlantıyı kesti.")
    except Exception as e:
        logger.error(f"Otomasyon WebSocket hatası: {e}", exc_info=True)
        await send(websocket, "error", f"[SİSTEM HATASI] {e}")
    finally:
        if watcher and not watcher.done():
            watcher.cancel()
