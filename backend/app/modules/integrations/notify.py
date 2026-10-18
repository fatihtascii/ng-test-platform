"""
Olaylara bağlı entegrasyon işleri (commit sonrası, arka planda çalışır; bkz. hooks.py).

- Koşum bitti      → Slack bildirimi (ayara göre yalnız hata varsa ya da her zaman)
- Hata kaydı açıldı → Slack bildirimi ve/veya Jira'ya otomatik aktarım
"""
import json
import logging

from app.db.database import SessionLocal
from . import clients, service

logger = logging.getLogger("ng-test.integrations")

FINISHED = {"Tamamlandı", "Başarısız"}
FAILED_VALUES = {"Failed", "Başarısız"}
PASSED_VALUES = {"Passed", "Başarılı"}


def _counts(results_text) -> dict:
    try:
        items = json.loads(results_text or "[]")
    except (TypeError, ValueError):
        items = []
    c = {"passed": 0, "failed": 0, "skipped": 0, "pending": 0}
    for r in items if isinstance(items, list) else []:
        st = (r or {}).get("status") or (r or {}).get("run_status")
        if st in PASSED_VALUES:
            c["passed"] += 1
        elif st in FAILED_VALUES:
            c["failed"] += 1
        elif st in ("Skipped", "Atlandı"):
            c["skipped"] += 1
        else:
            c["pending"] += 1
    return c


def run_message(run, project_name: str, defect_code=None) -> tuple[str, list]:
    c = _counts(run.results)
    executed = c["passed"] + c["failed"]
    rate = f"%{round(c['passed'] / executed * 100)}" if executed else "—"
    icon = "🔴" if c["failed"] else "🟢"
    url = f"{service.app_url()}/test-runs/{run.id}"
    kind = "Otomasyon koşumu" if getattr(run, "source", "manual") == "automation" else "Koşum"
    text = f"{icon} {kind} bitti: KS-{run.id} {run.name} ({project_name}) · {c['passed']} geçti, {c['failed']} kaldı · geçme oranı {rate}"
    lines = [f"*{icon} <{url}|KS-{run.id} {run.name}>*", f"{project_name} · {kind.lower()}",
             f"*{c['passed']}* geçti · *{c['failed']}* kaldı" + (f" · {c['skipped']} atlandı" if c["skipped"] else "")
             + (f" · {c['pending']} bekliyor" if c["pending"] else "") + f" · geçme oranı *{rate}*"]
    codes = [defect_code] if isinstance(defect_code, str) else list(defect_code or [])
    if codes:
        links = ", ".join(f"<{service.app_url()}/defects/{c}|{c}>" for c in codes[:5]) + (" …" if len(codes) > 5 else "")
        lines.append(("Hata kaydı: " if len(codes) == 1 else "Hata kayıtları: ") + links)
    return text, [{"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines)}}]


def run_finished(run_id: int):
    from app.modules.test_runs.models import TestRun
    from app.modules.defects.models import Defect
    db = SessionLocal()
    try:
        active, cfg = service.stored(db, "slack")
        if not active or not cfg.get("slackWebhook") or cfg.get("notifyOn") == "never":
            return
        run = db.query(TestRun).filter(TestRun.id == run_id).first()
        if not run or run.status not in FINISHED:
            return
        c = _counts(run.results)
        if cfg.get("notifyOn") == "failures" and not c["failed"]:
            return
        ids = [d.id for d in db.query(Defect.id).filter(Defect.test_run_id == run.id, Defect.source == "auto").order_by(Defect.id).limit(6)]
        text, blocks = run_message(run, run.project.name if run.project else "—", [f"BUG-{i}" for i in ids])
        try:
            clients.slack_post(cfg, text, blocks)
            service.log_event(db, "slack", "run_finished", True, text, f"KS-{run.id}")
        except clients.IntegrationError as e:
            service.log_event(db, "slack", "run_finished", False, str(e), f"KS-{run.id}")
    finally:
        db.close()


def defect_created(defect_id: int):
    from app.modules.defects.models import Defect
    db = SessionLocal()
    try:
        d = db.query(Defect).filter(Defect.id == defect_id).first()
        if not d:
            return
        active, cfg = service.stored(db, "slack")
        if active and cfg.get("slackWebhook") and cfg.get("notifyDefects"):
            url = f"{service.app_url()}/defects/BUG-{d.id}"
            text = f"🐞 Yeni hata kaydı: BUG-{d.id} {d.title} [{d.severity}]"
            blocks = [{"type": "section", "text": {"type": "mrkdwn", "text":
                f"*🐞 <{url}|BUG-{d.id} {d.title}>*\n{d.project.name if d.project else '—'} · önem *{d.severity}*"
                + (f" · {len(json.loads(d.failed_details or '[]'))} hatalı test" if d.failed_details else "")}}]
            try:
                clients.slack_post(cfg, text, blocks)
                service.log_event(db, "slack", "defect_created", True, text, f"BUG-{d.id}")
            except clients.IntegrationError as e:
                service.log_event(db, "slack", "defect_created", False, str(e), f"BUG-{d.id}")
        j_active, j_cfg = service.stored(db, "jira")
        if j_active and j_cfg.get("autoCreate") and not d.external_key:
            try:
                export_defect(db, d, j_cfg)
            except clients.IntegrationError:
                pass   # export_defect hatayı zaten kaydetti
    finally:
        db.close()


def defect_description(d) -> str:
    lines = []
    if d.description:
        lines += [d.description, ""]
    try:
        details = json.loads(d.failed_details or "[]")
    except ValueError:
        details = []
    if details:
        lines.append(f"Hatalı testler ({len(details)}):")
        for i, f in enumerate(details, 1):
            lines.append(f"{i}. {'TC-' + str(f.get('case_id')) + ' ' if f.get('case_id') else ''}{f.get('title') or 'İsimsiz test'}")
            if f.get("error"):
                lines.append("   " + str(f["error"]).split("\n")[0][:300])
        lines.append("")
    if d.test_run_id:
        lines.append(f"Koşum: KS-{d.test_run_id} {d.test_run.name if d.test_run else ''}".strip())
    lines.append(f"NG Test kaydı: {service.app_url()}/defects/BUG-{d.id}")
    return "\n".join(lines)


def export_defect(db, d, cfg: dict, user_id=None) -> tuple[str, str]:
    """Hata kaydını Jira'ya aktarır; anahtarı kayda ve geçmişe yazar. Hata olursa IntegrationError."""
    from app.modules.defects.models import DefectActivity
    try:
        key, url = clients.jira_create_issue(cfg, f"[BUG-{d.id}] {d.title}", defect_description(d), d.severity,
                                             ["ng-test", f"ng-bug-{d.id}"])
    except clients.IntegrationError as e:
        service.log_event(db, "jira", "issue_created", False, str(e), f"BUG-{d.id}")
        raise
    d.external_key, d.external_url = key, url
    db.add(DefectActivity(defect_id=d.id, user_id=user_id, kind="external", to_value=key, body=url))
    db.commit()
    service.log_event(db, "jira", "issue_created", True, f"BUG-{d.id} → {key}", key)
    return key, url
