"""
Otomasyon motorunun saf yardımcıları: dosya hazırlama, pytest çıktısını okuma, JUnit raporunu
çözümleme ve koşumu kaydetme. WebSocket akışı router.py'de.

Case ↔ dosya eşleşmesi: her case'in script'i `test_case_{id}_{rastgele}.py` dosyasına yazılır;
pytest çıktısındaki ve JUnit raporundaki dosya/modül adından case id'si okunur. Böylece sonuçlar
log satırlarının sırasına değil gerçek dosyaya göre eşlenir.
"""
import json
import logging
import os
import re
import shutil
import tempfile
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

logger = logging.getLogger("ng-test.automation")

# Koşum dosyaları proje dışındaki sistem temp dizinine yazılır; proje içine yazılan .py dosyaları
# `uvicorn --reload`'u tetikleyip koşumu yarıda kesiyordu.
RUN_DIR_PREFIX = "ngtest_run_"
BROWSER_MAP = {"Chrome": "chromium", "Edge": "chromium", "Firefox": "firefox", "Safari": "webkit"}
TIMEOUT_SEC = int(os.getenv("AUTOMATION_TIMEOUT_SEC", "1800"))
MAX_PARALLEL = int(os.getenv("AUTOMATION_MAX_PARALLEL", "2"))

CASE_FILE_RE = re.compile(r"test_case_(\d+)_[0-9a-f]{8}")
# pytest -v: "test_case_12_ab12cd34.py::test_login PASSED   [ 50%]" — -s ile çıktı araya girebilir
NODE_RE = re.compile(r"(test_case_(\d+)_[0-9a-f]{8})\.py::(\S+)")
STATUS_RE = re.compile(r"\b(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\b(?:\s+\[\s*\d+%\])?\s*$")
PYTEST_STATUS = {"PASSED": "passed", "XPASS": "passed", "FAILED": "failed", "ERROR": "failed", "SKIPPED": "skipped", "XFAIL": "skipped"}
RESULT_STATUS = {"passed": "Passed", "failed": "Failed", "skipped": "Skipped"}
CASE_STATUS = {"passed": "Başarılı", "failed": "Başarısız"}


def cleanup_stale_run_dirs(max_age_hours: int = 6):
    """Önceki çökmüş koşumlardan kalan geçici klasörleri siler."""
    root = tempfile.gettempdir()
    now = datetime.now().timestamp()
    for name in os.listdir(root):
        path = os.path.join(root, name)
        if name.startswith(RUN_DIR_PREFIX) and os.path.isdir(path):
            try:
                if now - os.path.getmtime(path) > max_age_hours * 3600:
                    shutil.rmtree(path, ignore_errors=True)
            except OSError:
                pass


def prepare_files(cases: list, run_dir: str) -> tuple[list[dict], list[dict]]:
    """
    cases: TestCase nesneleri (istenen sırada). Script'i olanlar dosyaya yazılır.
    Döner: (koşulacaklar [{case_id, title, file}], atlananlar [{case_id, title, reason}])
    """
    ready, skipped = [], []
    for tc in cases:
        script = (tc.automation_script or "").strip()
        if not script:
            skipped.append({"case_id": tc.id, "title": tc.title, "reason": "Otomasyon script'i yok"})
            continue
        fname = os.path.join(run_dir, f"test_case_{tc.id}_{uuid.uuid4().hex[:8]}.py")
        try:
            with open(fname, "w", encoding="utf-8") as f:
                f.write(tc.automation_script)
            ready.append({"case_id": tc.id, "title": tc.title, "file": fname})
        except OSError as e:
            logger.error(f"Test dosyası yazılamadı #{tc.id}: {e}")
            skipped.append({"case_id": tc.id, "title": tc.title, "reason": "Dosya yazılamadı"})
    return ready, skipped


def build_command(python: str, run_dir: str, files: list[str], browser: str, headless: bool,
                  base_url: Optional[str], junit_path: str) -> list[str]:
    cmd = [
        python, "-u", "-m", "pytest", "-v", "-s", "--tb=short",
        "-p", "no:cacheprovider", f"--rootdir={run_dir}",
        # Bir case script'indeki sözdizimi/import hatası diğer case'lerin koşmasını engellemesin
        "--continue-on-collection-errors",
        f"--browser={BROWSER_MAP.get(browser, 'chromium')}",
        f"--junitxml={junit_path}", "-o", "junit_family=xunit2",
    ]
    if not headless:
        cmd.append("--headed")
    if base_url:
        cmd.append(f"--base-url={base_url}")
    return cmd + files


class LiveTracker:
    """
    pytest -v çıktısını satır satır okuyup case bazında canlı durum çıkarır.
    Bir case dosyasında birden fazla test fonksiyonu olabilir: biri kalırsa case kalmıştır.
    """

    def __init__(self, case_ids: list[int]):
        self.state = {cid: "queued" for cid in case_ids}
        self.current: Optional[int] = None

    def feed(self, line: str) -> list[tuple[int, str]]:
        """Satırı işler; durumu değişen (case_id, durum) çiftlerini döner."""
        changes = []
        m = NODE_RE.search(line)
        if m:
            cid = int(m.group(2))
            if cid in self.state:
                self.current = cid
                if self.state[cid] == "queued":
                    self.state[cid] = "running"
                    changes.append((cid, "running"))
        s = STATUS_RE.search(line)
        if s and self.current is not None:
            new = PYTEST_STATUS[s.group(1)]
            old = self.state[self.current]
            # kaldı > geçti > atlandı (çok fonksiyonlu dosyada en kötü sonuç kalır)
            rank = {"queued": 0, "running": 0, "skipped": 1, "passed": 2, "failed": 3}
            if rank[new] >= rank.get(old, 0) or old == "running":
                if new != old:
                    self.state[self.current] = new
                    changes.append((self.current, new))
        return changes

    @property
    def finished(self) -> int:
        return sum(1 for v in self.state.values() if v in ("passed", "failed", "skipped"))


def _case_from_filename(tc) -> Optional[int]:
    m = CASE_FILE_RE.search(tc.get("classname", "") + " " + tc.get("file", "") + " " + tc.get("name", ""))
    return int(m.group(1)) if m else None


def parse_junit(path: str, redact=lambda t: t, resolve=_case_from_filename) -> dict[int, dict]:
    """
    JUnit raporundan case bazında {status, duration, message} çıkarır. Rapor yoksa {}.
    resolve: <testcase> öğesinden case id'sini bulur (script case'lerinde dosya adı, depo testlerinde node id).
    """
    if not os.path.exists(path):
        return {}
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return {}
    out: dict[int, dict] = {}
    for tc in root.iter("testcase"):
        cid = resolve(tc)
        if cid is None:
            continue
        status, message = "passed", None
        for child in tc:
            if child.tag in ("failure", "error"):
                status = "failed"
                text = (child.get("message") or "") + "\n" + (child.text or "")
                message = redact(text.strip())[-2000:]
                break
            if child.tag == "skipped":
                status = "skipped"
                message = redact(child.get("message") or "")[:500] or None
        e = out.setdefault(cid, {"status": "skipped", "duration": 0.0, "message": None, "tests": 0})
        e["tests"] += 1
        e["duration"] += float(tc.get("time") or 0)
        rank = {"skipped": 1, "passed": 2, "failed": 3}
        if e["tests"] == 1 or rank[status] > rank[e["status"]]:
            e["status"] = status
            if message:
                e["message"] = message
    for e in out.values():
        e["duration"] = round(e["duration"], 2)
    return out


def merge_results(ready: list[dict], skipped: list[dict], junit: dict, live: dict,
                  tail: list[str], process_failed: bool, timed_out: bool) -> list[dict]:
    """
    Son sonuç listesi (koşum kaydına yazılacak). Kaynak önceliği: JUnit > canlı çıktı.
    İkisinde de olmayan bir case için: süreç hatayla bittiyse (ör. import/collection hatası) kaldı,
    aksi halde atlandı sayılır.
    """
    tail_text = "\n".join(tail[-20:])
    results = []
    for r in ready:
        cid = r["case_id"]
        j = junit.get(cid)
        if j:
            status, msg, dur = j["status"], j["message"], j["duration"]
        else:
            st = live.get(cid)
            if st in ("passed", "failed", "skipped"):
                status, msg, dur = st, None, None
            elif timed_out:
                status, msg, dur = "failed", f"Zaman aşımı: koşum {TIMEOUT_SEC} saniyede bitmedi.", None
            elif process_failed:
                status, msg, dur = "failed", None, None
            else:
                status, msg, dur = "skipped", "Sonuç alınamadı", None
            if status == "failed" and not msg:
                msg = f"Otomasyon çıktısı (son satırlar):\n{tail_text}"
        item = {"case_id": cid, "status": RESULT_STATUS[status], "actual_result": msg or ""}
        if dur is not None:
            item["duration"] = dur
        results.append(item)
    for s in skipped:
        results.append({"case_id": s["case_id"], "status": "Skipped", "actual_result": s["reason"]})
    return results


def save_run(db, *, project_id: int, results: list[dict], user_id: Optional[int], meta: dict,
             env_name: Optional[str], test_plan_id: Optional[int] = None) -> tuple[Optional[int], Optional[dict]]:
    """Koşumu source='automation' olarak kaydeder, case statülerini günceller, kalan her case için bug açar
    (geçen case'in açık bug'ını çözer). Plana bağlıysa plan kalemlerinin sonucu güncellenir.
    Dönüş: (run_id, sync_case_defects özeti)"""
    from app.modules.test_runs.models import TestRun
    from app.modules.test_cases.models import TestCase
    from app.modules.defects.service import sync_case_defects

    passed = sum(r["status"] == "Passed" for r in results)
    failed = sum(r["status"] == "Failed" for r in results)
    skipped = sum(r["status"] == "Skipped" for r in results)
    ids = [r["case_id"] for r in results if r["status"] in ("Passed", "Failed")]
    for tc in db.query(TestCase).filter(TestCase.id.in_(ids)).all() if ids else []:
        st = next(r["status"] for r in results if r["case_id"] == tc.id)
        tc.status = "Başarılı" if st == "Passed" else "Başarısız"

    stamp = datetime.now().strftime("%d.%m %H:%M")
    parts = [f"{passed} geçti", f"{failed} kaldı"] + ([f"{skipped} atlandı"] if skipped else [])
    run = TestRun(
        name=f"Otomasyon koşumu · {stamp}" + (f" · {env_name}" if env_name else ""),
        description=f"{len(results)} otomasyon testi: " + ", ".join(parts) + "."
                    + (f" Ortam: {env_name}." if env_name else ""),
        project_id=project_id, status="Başarısız" if failed else "Tamamlandı",
        results=json.dumps(results, ensure_ascii=False), source="automation",
        created_by=user_id, meta=json.dumps(meta, ensure_ascii=False), test_plan_id=test_plan_id,
    )
    db.add(run)
    db.flush()
    if test_plan_id:
        from app.modules.test_runs.service import sync_plan_items
        sync_plan_items(db, run)
    defects = sync_case_defects(db, run)
    from app.modules.integrations import hooks, notify
    hooks.on_commit(db, notify.run_finished, run.id)
    db.commit()
    return run.id, defects
