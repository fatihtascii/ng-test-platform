"""
Depo senkronizasyonu (arka planda): çek → sanal ortam → keşif → case'leri içe aktar.
Durum ve günlük suite kaydına yazılır; arayüz bunları okuyarak ilerlemeyi gösterir.
"""
import json
import logging
import threading
from datetime import datetime, timezone

from app.db.database import SessionLocal
from . import docstring, models, workspace

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
            if workspace.is_local(suite.repo_url):
                log(f"[1/4] Yerel klasör okunuyor: {suite.repo_url}")
            else:
                log(f"[1/4] Depo çekiliyor: {suite.repo_url} ({suite.branch})")
            sha, msg = workspace.fetch_repo(suite, log)
            log(f"      → {sha[:7]} {msg}".rstrip())
            log("[2/4] Sanal ortam ve bağımlılıklar")
            workspace.ensure_venv(suite, log)
            log(f"[3/4] Testler keşfediliyor: {suite.test_path}")
            items = workspace.collect(suite, suite.test_path, env_vars_for(db, suite.environment_id), log)
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


LEGACY_STEP = "Otomasyon testi: "


def _desc(text) -> dict:
    try:
        v = json.loads(text) if text else {}
        return v if isinstance(v, dict) else {}
    except (TypeError, ValueError):
        return {}


def build_content(g: dict) -> tuple[str, str]:
    """Docstring'den (başlık, açıklama JSON'u). Adım yazılmamışsa tek adımlık özet kullanılır."""
    d = docstring.parse(g["doc"])
    title = d["title"] or workspace.humanize(g["ref"])
    summary = d["summary"]
    if g["params"]:
        summary = (summary + f"\n\nBu test {g['params']} farklı veriyle koşar.").strip()
    steps = [{"id": f"s{i + 1}", "action": s["action"], "expectedResult": s["expected"], "image": None}
             for i, s in enumerate(d["steps"])]
    if not steps:
        steps = [{"id": "s1", "action": f"{LEGACY_STEP}{g['ref']}", "expectedResult": "Test geçer.", "image": None}]
    desc = {"steps": steps, "summary": summary, "type": "Regression", "execution_type": "Automated",
            "auto": {"title": title}}       # "auto": içerik depodan geliyor; arayüzden düzenlenince bu alan düşer
    return title[:500], json.dumps(desc, ensure_ascii=False)


def _is_generated(tc) -> tuple[bool, bool]:
    """(açıklama depodan mı, başlık depodan mı) — elle düzenlenen alanlar senkronizasyonda ezilmez."""
    d = _desc(tc.description)
    if "auto" in d:
        return True, tc.title == (d.get("auto") or {}).get("title")
    steps = d.get("steps") or []
    legacy = len(steps) == 1 and str(steps[0].get("action", "")).startswith(LEGACY_STEP)   # ilk sürümün tek adımlı biçimi
    return legacy, legacy


def import_tests(db, suite, groups: list[dict]) -> dict:
    """
    Her test fonksiyonu için case oluşturur/günceller. Başlık ve adımlar docstring'den gelir;
    arayüzden elle düzenlenmiş başlık/adımlar, öncelik ve durum korunur.
    """
    from app.modules.test_cases.models import TestCase
    existing = {c.automation_ref: c for c in db.query(TestCase).filter(TestCase.suite_id == suite.id).all()}
    seen, added, updated = set(), 0, 0
    markers: dict[str, int] = {}
    for g in groups:
        for m in g["markers"]:
            markers[m] = markers.get(m, 0) + 1
    for g in groups:
        seen.add(g["ref"])
        title, desc = build_content(g)
        tc = existing.get(g["ref"])
        if tc is None:
            tc = TestCase(title=title, project_id=suite.project_id,
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
            gen_desc, gen_title = _is_generated(tc)
            new_desc = desc if gen_desc else tc.description
            new_title = title if gen_title else tc.title
            if gen_desc and not gen_title:
                # başlık elle değişti: "auto.title" eski üretilen başlığı göstermeye devam etsin
                d = json.loads(desc)
                d["auto"]["title"] = (_desc(tc.description).get("auto") or {}).get("title", "")
                new_desc = json.dumps(d, ensure_ascii=False)
            if (tc.description != new_desc or tc.title != new_title or json.loads(tc.tags or "[]") != tags
                    or tc.project_id != suite.project_id):
                tc.description, tc.title, tc.project_id = new_desc, new_title, suite.project_id
                tc.tags = json.dumps(tags, ensure_ascii=False)
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
