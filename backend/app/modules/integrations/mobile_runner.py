# backend/app/modules/integrations/mobile_runner.py
#
# Mevcut main.py'e şu satırı ekleyin:
#   from app.modules.integrations.mobile_runner import router as mobile_router
#   app.include_router(mobile_router, prefix="/api/mobile", tags=["Mobile Tests"])

import asyncio
import subprocess
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.appium_utils import get_all_devices
import json

from sqlalchemy.orm import Session
from app.core.deps import get_db, require_permission, require_permission_query_ok

router = APIRouter()

# Bellekte run store — production'da mevcut DB session'ınızı kullanın
_runs: dict = {}


# ── Schemas ──────────────────────────────────────────────────────────────────

class MobileRunRequest(BaseModel):
    test_case_id: int          # Mevcut TestCase.id ile ilişki
    device_id: str             # adb serial veya iOS udid
    platform: str              # "android" | "ios"
    app_path: str              # /path/to/app.apk veya .ipa
    app_package: Optional[str] = None      # Android: com.example.app
    app_activity: Optional[str] = None     # Android: .MainActivity
    bundle_id: Optional[str] = None        # iOS: com.example.app
    appium_server: str = "http://localhost:4723"


class MobileRunResponse(BaseModel):
    run_id: str
    test_case_id: int
    status: str
    started_at: str


# ── Device Discovery ──────────────────────────────────────────────────────────

def _get_android_devices() -> list:
    try:
        result = subprocess.run(
            ["adb", "devices", "-l"],
            capture_output=True, text=True, timeout=10
        )
        devices = []
        for line in result.stdout.strip().splitlines()[1:]:
            if not line.strip() or "offline" in line:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            serial = parts[0]

            def _prop(prop):
                r = subprocess.run(
                    ["adb", "-s", serial, "shell", "getprop", prop],
                    capture_output=True, text=True, timeout=5
                )
                return r.stdout.strip()

            devices.append({
                "id": serial,
                "name": _prop("ro.product.model") or serial,
                "platform": "android",
                "version": _prop("ro.build.version.release"),
                "api_level": _prop("ro.build.version.sdk"),
                "is_emulator": serial.startswith("emulator"),
                "status": "connected",
            })
        return devices
    except FileNotFoundError:
        return []


def _get_ios_devices() -> list:
    try:
        result = subprocess.run(
            ["xcrun", "simctl", "list", "devices", "booted", "--json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        devices = []
        import re
        for runtime, device_list in data.get("devices", {}).items():
            if "iOS" not in runtime:
                continue
            m = re.search(r"iOS-(\d+)-(\d+)", runtime)
            version = f"{m.group(1)}.{m.group(2)}" if m else "unknown"
            for d in device_list:
                if d.get("state") == "Booted":
                    devices.append({
                        "id": d["udid"],
                        "name": d["name"],
                        "platform": "ios",
                        "version": version,
                        "api_level": None,
                        "is_emulator": True,
                        "status": "connected",
                    })
        return devices
    except Exception:
        return []


# ── Appium Test Runner ────────────────────────────────────────────────────────

class AppiumRunner:
    def __init__(self, run_id: str, req: MobileRunRequest):
        self.run_id = run_id
        self.req = req

    def _log(self, msg: str, level: str = "info"):
        entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "msg": msg,
            "level": level,
        }
        _runs[self.run_id]["logs"].append(entry)

    def _build_capabilities(self) -> dict:
        base = {
            "appium:newCommandTimeout": 60,
            "appium:app": self.req.app_path,
        }
        if self.req.platform == "android":
            return {
                "platformName": "Android",
                "appium:deviceName": self.req.device_id,
                "appium:automationName": "UiAutomator2",
                "appium:appPackage": self.req.app_package,
                "appium:appActivity": self.req.app_activity,
                **base,
            }
        return {
            "platformName": "iOS",
            "appium:deviceName": self.req.device_id,
            "appium:automationName": "XCUITest",
            "appium:bundleId": self.req.bundle_id or self.req.app_package,
            "appium:udid": self.req.device_id,
            **base,
        }

    async def execute(self):
        """
        Appium testini asenkron çalıştırır.
        Gerçek test adımlarını buraya yazın ya da
        test_case_id'ye göre DB'den çekip dinamik yürütün.
        """
        _runs[self.run_id]["status"] = "running"
        driver = None

        try:
            # İçeride: appium kurulu değilse koşu "running"de takılıp log akışı hiç bitmiyordu
            from appium import webdriver
            from appium.options import AppiumOptions
            self._log(f"Appium server bağlantısı → {self.req.appium_server}")
            caps = self._build_capabilities()
            options = AppiumOptions().load_capabilities(caps)

            driver = await asyncio.to_thread(
                webdriver.Remote, self.req.appium_server, options
            )
            self._log("Uygulama başlatıldı", "ok")

            # ── Buraya test adımlarınızı ekleyin ──────────────────────────
            # Örnek:
            # from appium.webdriver.common.appiumby import AppiumBy
            # el = driver.find_element(AppiumBy.ID, "com.example:id/login_btn")
            # el.click()
            # ─────────────────────────────────────────────────────────────

            await asyncio.sleep(0.5)  # placeholder — gerçek adımlarla değiştirin
            self._log("Tüm adımlar başarıyla tamamlandı", "ok")
            _runs[self.run_id]["status"] = "passed"

        except ImportError:
            self._log("Appium Python istemcisi kurulu değil: pip install Appium-Python-Client", "error")
            _runs[self.run_id]["status"] = "failed"
        except Exception as e:
            self._log(f"HATA: {str(e)}", "error")
            _runs[self.run_id]["status"] = "failed"
        finally:
            if driver:
                await asyncio.to_thread(driver.quit)
            _runs[self.run_id]["finished_at"] = datetime.now().isoformat()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/devices", dependencies=[Depends(require_permission("automation.view"))])
def list_devices():
    """Bağlı Android ve iOS cihazları listeler."""
    return get_all_devices()


@router.post("/run", response_model=MobileRunResponse, status_code=201,
             dependencies=[Depends(require_permission("automation.execute"))])
async def start_run(req: MobileRunRequest, db: Session = Depends(get_db)):
    """
    Mobil test koşusunu başlatır.
    test_case_id: mevcut TestCase tablosundaki id ile eşleşmeli.
    """
    from app.modules.test_cases.models import TestCase
    if not db.query(TestCase.id).filter(TestCase.id == req.test_case_id).first():
        raise HTTPException(404, "Test case bulunamadı.")
    if req.platform not in ("android", "ios"):
        raise HTTPException(422, "Platform 'android' ya da 'ios' olmalı.")
    if not req.app_path.strip():
        raise HTTPException(422, "Uygulama yolu zorunlu.")
    run_id = str(uuid.uuid4())[:8]
    _runs[run_id] = {
        "id": run_id,
        "test_case_id": req.test_case_id,
        "device_id": req.device_id,
        "platform": req.platform,
        "status": "pending",
        "started_at": datetime.now().isoformat(),
        "finished_at": None,
        "logs": [],
    }
    runner = AppiumRunner(run_id, req)
    asyncio.create_task(runner.execute())
    return MobileRunResponse(
        run_id=run_id,
        test_case_id=req.test_case_id,
        status="started",
        started_at=_runs[run_id]["started_at"],
    )


@router.get("/run/{run_id}", dependencies=[Depends(require_permission("automation.view"))])
def get_run(run_id: str):
    """Koşu durumu ve loglarını döner."""
    if run_id not in _runs:
        raise HTTPException(404, "Koşu bulunamadı")
    return _runs[run_id]


@router.get("/run/{run_id}/logs/stream",
            dependencies=[Depends(require_permission_query_ok("automation.view"))])
async def stream_logs(run_id: str):
    """
    Server-Sent Events ile canlı log akışı.
    React: const es = new EventSource('/api/mobile/run/{id}/logs/stream')
    """
    if run_id not in _runs:
        raise HTTPException(404, "Koşu bulunamadı")

    async def generator():
        sent = 0
        while True:
            logs = _runs[run_id]["logs"]
            while sent < len(logs):
                yield f"data: {json.dumps(logs[sent], ensure_ascii=False)}\n\n"
                sent += 1
            final = _runs[run_id]["status"]
            if final in ("passed", "failed"):
                # Son mesaj koşunun sonucunu da taşır; arayüz geçti/kaldı gösterebilsin
                yield f"data: {json.dumps({'msg': '[DONE]', 'level': 'info', 'status': final})}\n\n"
                break
            await asyncio.sleep(0.3)

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/runs", dependencies=[Depends(require_permission("automation.view"))])
def list_runs():
    """Tüm koşuları döner."""
    return list(_runs.values())
