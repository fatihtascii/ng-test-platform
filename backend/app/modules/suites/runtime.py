"""
Depo testlerini koşuma hazırlar: komut, çalışma klasörü, ortam değişkenleri ve sonuç eşleme.
core.execute tarafından kullanılır; burada süreç başlatılmaz.
"""
import os
import re
from dataclasses import dataclass, field
from typing import Optional

from app.db.database import SessionLocal
from app.modules.automation import runner
from . import models, sync, workspace

NODE_RE = re.compile(r"((?:[\w.\-]+/)*[\w.\-]+\.py(?:::[\w.\-]+)+)(\[[^\]]*\])?")
ANY_STATUS = re.compile(r"\b(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\b")
RANK = {"queued": 0, "running": 0, "skipped": 1, "passed": 2, "failed": 3}


class PrepareError(Exception):
    pass


class SuiteTracker:
    """
    pytest -v çıktısından case bazında canlı durum. Hem normal ("tests/a.py::t PASSED [ 5%]")
    hem xdist ("[gw0] [ 5%] PASSED tests/a.py::t") biçimini okur; parametreli testlerde en kötü sonuç kalır.
    """

    def __init__(self, ref_to_case: dict[str, int]):
        self.map = ref_to_case
        self.state = {cid: "queued" for cid in set(ref_to_case.values())}
        self.current: Optional[int] = None

    def feed(self, line: str) -> list[tuple[int, str]]:
        changes = []
        m = NODE_RE.search(line)
        cid = self.map.get(m.group(1)) if m else None
        if cid is not None:
            self.current = cid
            if self.state[cid] == "queued":
                self.state[cid] = "running"
                changes.append((cid, "running"))
        s = runner.STATUS_RE.search(line) or (ANY_STATUS.search(line[:m.start()]) if m else None)
        target = cid if cid is not None else (self.current if not m else None)
        if s and target is not None:
            new, old = runner.PYTEST_STATUS[s.group(1)], self.state[target]
            if (old == "running" or RANK[new] >= RANK[old]) and new != old:
                self.state[target] = new
                changes.append((target, new))
        return changes

    @property
    def finished(self) -> int:
        return sum(1 for v in self.state.values() if v in ("passed", "failed", "skipped"))


@dataclass
class SuitePlan:
    suite_id: int
    suite_name: str
    project_id: int
    python: str
    cwd: str
    args: list[str]
    ready: list[dict]
    tracker: SuiteTracker
    junit_resolve: object
    timeout_sec: int
    environment_id: Optional[int]
    notes: list[str] = field(default_factory=list)


def prepare(config: dict, cases: list) -> SuitePlan:
    """
    config["suite_id"] + config["marker"] → profil koşumu (pytest -m)
    cases (hepsi aynı depodan) → seçili testler
    """
    from app.modules.test_cases.models import TestCase
    db = SessionLocal()
    try:
        suite_id = config.get("suite_id") or next((c.suite_id for c in cases if c.suite_id), None)
        suite = db.query(models.AutomationSuite).filter(models.AutomationSuite.id == suite_id).first()
        if not suite:
            raise PrepareError("Otomasyon deposu bulunamadı.")
        if cases and any(c.suite_id != suite.id or not c.automation_ref for c in cases):
            raise PrepareError("Depo testleri, script'li case'lerle ya da başka depoların testleriyle aynı koşumda koşulamaz.")
        if sync.is_running(suite.id):
            raise PrepareError("Depo şu an senkronize ediliyor; bitince tekrar deneyin.")
        if suite.sync_status != "ready" or not os.path.exists(workspace.venv_python(suite)):
            raise PrepareError("Depo henüz hazır değil; önce senkronize edin.")
        env_id = config.get("environment_id") or suite.environment_id
        env_vars = sync.env_vars_for(db, env_id)
        notes: list[str] = []
        marker = (config.get("marker") or "").strip() if not cases else None
        if not cases:
            items = workspace.collect(suite, suite.test_path, env_vars, lambda _l: None, marker or None)
            refs = list(dict.fromkeys(workspace.base_nodeid(i["nodeid"]) for i in items))
            rows = db.query(TestCase).filter(TestCase.suite_id == suite.id, TestCase.automation_ref.in_(refs)).all() if refs else []
            by_ref = {r.automation_ref: r for r in rows}
            cases = [by_ref[r] for r in refs if r in by_ref]
            unknown = len(refs) - len(cases)
            if unknown:
                notes.append(f"{unknown} test henüz NG Test'e aktarılmamış (depoyu senkronize edin); koşulur ama sonuçları case'e yazılmaz.")
            if not refs:
                raise PrepareError(f"'{marker or 'tümü'}' ifadesine uyan test yok.")
        ref_to_case = {c.automation_ref: c.id for c in cases}
        key_to_case = {workspace.junit_key(c.automation_ref): c.id for c in cases}

        def resolve(tc_el):
            name = (tc_el.get("name") or "").split("[", 1)[0]
            return key_to_case.get((tc_el.get("classname") or "", name))

        args = ["-n", str(suite.workers)] if suite.workers > 1 else []
        if marker is not None:
            args += (["-m", marker] if marker else []) + [suite.test_path]
        else:
            args += [c.automation_ref for c in cases]
        return SuitePlan(
            suite_id=suite.id, suite_name=suite.name, project_id=suite.project_id,
            python=workspace.venv_python(suite), cwd=str(workspace.repo_dir(suite)), args=args,
            ready=[{"case_id": c.id, "title": c.title, "ref": c.automation_ref} for c in cases],
            tracker=SuiteTracker(ref_to_case), junit_resolve=resolve,
            timeout_sec=suite.timeout_minutes * 60, environment_id=env_id, notes=notes,
        )
    finally:
        db.close()
