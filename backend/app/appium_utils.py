import subprocess, re, os, json
from typing import List, Dict, Any

_EXTRA = [
    "/usr/local/bin", "/opt/homebrew/bin",
    os.path.expanduser("~/Library/Android/sdk/platform-tools"),
    os.path.expanduser("~/.android/sdk/platform-tools"),
]

def _env():
    e = os.environ.copy()
    e["PATH"] = ":".join(_EXTRA) + ":" + e.get("PATH", "")
    return e

def _run(cmd, timeout=10):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=_env())

def get_android_devices() -> List[Dict[str, Any]]:
    try:
        out = _run(["adb", "devices", "-l"]).stdout.strip().splitlines()[1:]
        devices = []
        for line in out:
            line = line.strip()
            if not line or "offline" in line or "unauthorized" in line:
                continue
            parts = line.split()
            if len(parts) < 2 or parts[1] != "device":
                continue
            s = parts[0]
            def p(prop, s=s):
                try: return _run(["adb","-s",s,"shell","getprop",prop],5).stdout.strip()
                except: return ""
            devices.append({
                "id": s, "name": p("ro.product.model") or s,
                "platform": "android", "version": p("ro.build.version.release"),
                "api_level": p("ro.build.version.sdk"),
                "is_emulator": s.startswith("emulator"), "status": "connected",
            })
        return devices
    except Exception:
        return []

def get_ios_devices() -> List[Dict[str, Any]]:
    try:
        data = json.loads(_run(["xcrun","simctl","list","devices","booted","--json"]).stdout)
        devices = []
        for runtime, dl in data.get("devices", {}).items():
            if "iOS" not in runtime: continue
            m = re.search(r"iOS-(\d+)-(\d+)", runtime)
            v = f"{m.group(1)}.{m.group(2)}" if m else "unknown"
            for d in dl:
                if d.get("state") == "Booted":
                    devices.append({"id": d["udid"], "name": d["name"], "platform": "ios",
                        "version": v, "api_level": None, "is_emulator": True, "status": "connected"})
        return devices
    except Exception:
        return []

def get_all_devices():
    return get_android_devices() + get_ios_devices()