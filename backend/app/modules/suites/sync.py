"""
Depo senkronizasyonu (arka planda): çek → sanal ortam → keşif → case'leri içe aktar.
Durum ve günlük suite kaydına yazılır; arayüz bunları okuyarak ilerlemeyi gösterir.
"""
import json
import logging
import threading
from datetime import datetime, timezone

from app.db.database import SessionLocal
from . import models, workspace

logger = logging.getLogger("ng-test.suites")
_running: set[int] = set()
_lock = threading.Lock()
MAX_LOG = 30000


def env_vars_for(db, environment_id) -> dict:
    if not environment_id:
        return {}
    from app.modules.environments.models import Environment
    from app.modules.environments.service import resolve_variables
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        return {}
    out = {r["key"]: r["value"] for r in resolve_variables(db, env)}
    out["NG_ENVIRONMENT"] = env.name
    return out


def secrets_for(db, environment_id) -> list[str]:
    if not environment_id:
        return []
    from app.modules.environments.models import Environment
    from app.modules.environments.service import resolve_variables
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    return [r["value"] for r in resolve_variables(db, env) if r["is_secret"] and len(r["value"]) >= 4] if env else []


def is_running(suite_id: int) -> bool:
    return suite_id in _running


def start(suite_id: int) -> bool:
    """Senkronizasyonu başlatır; zaten sürüyorsa False."""
    from app.modules.integrations import hooks
    with _lock:
        if suite_id in _running:
            return False
        _running.add(suite_id)
    hooks.dispatch(_job, suite_id)
    return True


def _job(suite_id: int):
    lines: list[str] = []
    db = SessionLocal()
    try:
        suite = db.query(models.AutomationSuite).filter(models.AutomationSuite.id == suite_id).first()
        if not suite:
            return
        secrets = secrets_for(db, suite.environment_id) + ([suite.token] if suite.token else [])

        def log(line: str):
            for s in secrets:
                line = line.replace(s, "***")
            lines.append(line)
            text = "\n".join(lines)
            suite.sync_log = text[-MAX_LOG:]
            db.commit()

        suite.sync_status, suite.sync_log = "syncing", ""
        db.commit()
        try:
            log(f"[1/4] Depo çekiliyor: {suite.repo_url} ({suite.branch})")
            sha, msg = workspace.fetch_repo(suite.id, suite.repo_url, suite.branch, suite.token, log)
            log(f"      → {sha[:7]} {msg}")
            log("[2/4] Sanal ortam ve bağımlılıklar")
            workspace.ensure_venv(suite.id, log)
            log(f"[3/4] Testler keşfediliyor: {suite.test_path}")
            items = workspace.collect(suite.id, suite.test_path, env_vars_for(db, suite.environment_id), log)
            groups = workspace.group_tests(items)
            log(f"      → {len(items)} test ({len(groups)} test fonksiyonu)")
            log("[4/4] Case'ler içe aktarılıyor")
            summary = import_tests(db, suite, groups)
            summary["tests"] = len(items)
            log(f"      → {summary['added']} yeni, {summary['updated']} güncellendi, {summary['missing']} depoda yok")
            suite.commit_sha, suite.commit_message = sha, msg
            suite.sync_summary = json.dumps(summary, ensure_ascii=False)
            suite.synced_at = datetime.now(timezone.utc)
            suite.sync_status = "ready"
            log("Senkronizasyon tamamlandı.")
        except workspace.SyncError as e:
            suite.sync_status = "error"
            log(f"HATA: {e}")
        except Exception as e:      # beklenmeyen hata da kullanıcıya görünsün
            logger.error(f"Depo senkronizasyonu çöktü #{suite_id}: {e}", exc_info=True)
            suite.sync_status = "error"
            log(f"HATA: {e}")
        db.commit()
    finally:
        db.close()
        with _lock:
            _running.discard(suite_id)


MISSING_TAG = "depoda-yok"


def import_tests(db, suite, groups: list[dict]) -> dict:
    """Her test fonksiyonu için case oluşturur/günceller. Kullanıcının başlık, öncelik ve durum düzenlemeleri korunur."""
    from app.modules.test_cases.models import TestCase
    existing = {c.automation_ref: c for c in db.query(TestCase).filter(TestCase.suite_id == suite.id).all()}
    seen, added, updated = set(), 0, 0
    markers: dict[str, int] = {}
    for g in groups:
        for m in g["markers"]:
            markers[m] = markers.get(m, 0) + 1
    for g in groups:
        seen.add(g["ref"])
        desc = json.dumps({
            "steps": [{"id": "s1", "action": f"Otomasyon testi: {g['ref']}" + (f" ({g['params']} varyasyon)" if g["params"] else ""),
                       "expectedResult": g["doc"] or "Test geçer.", "image": None}],
            "type": "Regression", "execution_type": "Automated",
        }, ensure_ascii=False)
        tc = existing.get(g["ref"])
        if tc is None:
            tc = TestCase(title=(g["doc"] or workspace.humanize(g["ref"]))[:500], project_id=suite.project_id,
                          execution_type="Automated", suite_id=suite.id, automation_ref=g["ref"],
                          tags=json.dumps(g["markers"], ensure_ascii=False), description=desc)
            db.add(tc)
            added += 1
        else:
            try:
                old_tags = [t for t in json.loads(tc.tags or "[]") if t != MISSING_TAG]
            except ValueError:
                old_tags = []
            # Depodaki işaretler güncellenir; depoda işaret olarak geçmeyen (elle eklenmiş) etiketler korunur
            tags = sorted(set(g["markers"]) | {t for t in old_tags if t not in markers})
            if tc.description != desc or json.loads(tc.tags or "[]") != tags or tc.project_id != suite.project_id:
                tc.description, tc.tags, tc.project_id = desc, json.dumps(tags, ensure_ascii=False), suite.project_id
                updated += 1
    missing = 0
    for ref, tc in existing.items():
        if ref in seen:
            continue
        try:
            tags = json.loads(tc.tags or "[]")
        except ValueError:
            tags = []
        if MISSING_TAG not in tags:
            tc.tags = json.dumps(tags + [MISSING_TAG], ensure_ascii=False)
        missing += 1
    db.commit()
    return {"added": added, "updated": updated, "missing": missing, "functions": len(groups),
            "markers": dict(sorted(markers.items(), key=lambda x: (-x[1], x[0])))}
