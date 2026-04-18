import asyncio
import json
import logging
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.db.database import get_db
from . import schemas, service

logger = logging.getLogger("ng-test.websocket")
router = APIRouter(prefix="/test-runs", tags=["Test Runs"])
ws_router = APIRouter(tags=["WebSockets"]) # Websocket için ayrı router tanımı

# ── REST ENDPOINT'LERİ ──
@router.post("/", response_model=schemas.TestRunResponse, status_code=201)
def create_test_run(run: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.create_test_run(db, run)

@router.get("/", response_model=list[schemas.TestRunResponse])
def get_test_runs(db: Session = Depends(get_db)):
    return service.get_test_runs(db)

@router.get("/{run_id}", response_model=schemas.TestRunResponse)
def get_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.get_test_run_by_id(db, run_id)

@router.put("/{run_id}", response_model=schemas.TestRunResponse)
def update_test_run(run_id: int, data: schemas.TestRunCreate, db: Session = Depends(get_db)):
    return service.update_test_run(db, run_id, data)

@router.delete("/{run_id}")
def delete_test_run(run_id: int, db: Session = Depends(get_db)):
    return service.delete_test_run(db, run_id)


# ── WEBSOCKET ENDPOINT'İ ──
_active_ws_connections: set = set()
MAX_WS_CONNECTIONS = 5

@ws_router.websocket("/ws/run-test")
async def websocket_run_test(websocket: WebSocket):
    if len(_active_ws_connections) >= MAX_WS_CONNECTIONS:
        await websocket.close(code=1008, reason="Sunucu kapasitesi dolu.")
        return

    await websocket.accept()
    _active_ws_connections.add(id(websocket))

    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        config = json.loads(raw)

        environment = str(config.get("environment", "QA"))[:20]
        browser     = str(config.get("browser",     "Chrome"))[:20]

        await websocket.send_json({
            "type":    "info",
            "message": f"[SYSTEM] Koşum başlatılıyor... (Ortam: {environment}, Tarayıcı: {browser})",
        })

        dummy_script = r"""
import time, sys
def log(msg): print(msg, flush=True)

log("[INFO] Ortam değişkenleri yükleniyor...")
time.sleep(1)
log("[RUNNING] Test Case 1: Kullanıcı Login Senaryosu")
time.sleep(2)
log("[SUCCESS] Test Case 1 Başarılı!")
time.sleep(1)
log("[RUNNING] Test Case 2: Sepete Ürün Ekleme")
time.sleep(2)
log("[ERROR] Test Case 2 Başarısız: 'add-to-cart-btn' bulunamadı! (Timeout 5000ms)")
time.sleep(1)
log("[INFO] Koşum tamamlandı.")
"""
        process = await asyncio.create_subprocess_exec(
            "python", "-c", dummy_script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        while True:
            try:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "warn", "message": "[WARN] Subprocess yanıt vermiyor, zaman aşımı."})
                process.kill()
                break
            
            if not line:
                break
                
            text     = line.decode("utf-8").strip()
            log_type = (
                "error"   if "[ERROR]"   in text or "[FAILED]"  in text else
                "success" if "[SUCCESS]" in text or "[PASSED]"  in text else
                "running" if "[RUNNING]" in text else
                "info"
            )
            await websocket.send_json({"type": log_type, "message": text})

        await process.wait()
        await websocket.send_json({"type": "info", "message": "[SYSTEM] Subprocess sonlandı."})
        await websocket.send_json({"type": "done"})

    except asyncio.TimeoutError:
        try:
            await websocket.send_json({"type": "error", "message": "[CRITICAL] Bağlantı zaman aşımına uğradı."})
        except Exception:
            pass
    except WebSocketDisconnect:
        logger.info("WebSocket bağlantısı istemci tarafından kapatıldı.")
    except json.JSONDecodeError:
        try:
            await websocket.send_json({"type": "error", "message": "[CRITICAL] Geçersiz JSON formatı."})
        except Exception:
            pass
    except Exception as e:
        logger.error(f"WebSocket hatası: {e}")
        try:
            await websocket.send_json({"type": "error", "message": "[CRITICAL] Sunucu hatası oluştu."})
        except Exception:
            pass
    finally:
        _active_ws_connections.discard(id(websocket))