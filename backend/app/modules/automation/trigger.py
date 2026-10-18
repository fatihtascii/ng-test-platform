"""
Otomasyonu dışarıdan tetikleme.

POST /automation/runs        CI'dan (Jenkins, GitLab, GitHub Actions…) çağrılır; Bearer token + automation.execute.
                             Koşum bitene kadar bekler, özet döner. Kalan test varsa "passed": false.
POST /webhooks/github        GitHub webhook'u (imza doğrulamalı). push veya başarılı deployment olayında
                             ayarlardaki projenin otomasyon testlerini arka planda koşturur ve commit'e durum yazar.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.deps import require_permission
from app.db.database import SessionLocal
from . import core

logger = logging.getLogger("ng-test.automation")
router = APIRouter(tags=["Automation"])


async def _log_emit(type_, message="", **extra):
    if type_ in ("error", "warn") and message:
        logger.info(f"[otomasyon] {message}")


def project_case_ids(db, project_id: int, case_ids: Optional[list[int]] = None) -> list[int]:
    from app.modules.test_cases.models import TestCase
    q = db.query(TestCase.id).filter(TestCase.project_id == project_id, TestCase.execution_type == "Automated",
                                     TestCase.automation_script.isnot(None), TestCase.automation_script != "")
    if case_ids:
        q = q.filter(TestCase.id.in_(case_ids))
    return [r.id for r in q.order_by(TestCase.id)]


class TriggerBody(BaseModel):
    project_id:     int = Field(..., gt=0)
    case_ids:       Optional[list[int]] = None      # boşsa projenin tüm otomasyon case'leri
    environment_id: Optional[int] = None
    browser:        str = "Chrome"


@router.post("/automation/runs")
async def trigger_run(body: TriggerBody, current=Depends(require_permission("automation.execute"))):
    db = SessionLocal()
    try:
        ids = project_case_ids(db, body.project_id, body.case_ids)
    finally:
        db.close()
    if not ids:
        raise HTTPException(status_code=422, detail="Projede koşulacak otomasyon case'i (script'i olan) yok.")
    try:
        summary = await core.execute({"cases": ids, "browser": body.browser, "headless": True,
                                      "environment_id": body.environment_id},
                                     current.id, _log_emit, asyncio.Event(), trigger={"source": "api"})
    except core.StartError as e:
        raise HTTPException(status_code=409 if "sürüyor" in str(e) else 422, detail=str(e))
    if not summary:
        raise HTTPException(status_code=500, detail="Koşum tamamlanamadı.")
    from app.modules.integrations.service import app_url
    return {**summary, "passed": summary["counts"]["failed"] == 0,
            "url": f"{app_url()}/test-runs/{summary['run_id']}" if summary["run_id"] else None}


# ── GitHub ────────────────────────────────────────────────────────

def _github_job(cfg: dict, sha: str, event: str, ref_label: str):
    """Arka planda: commit'e 'pending' yaz, koş, sonucu yaz. Her adım gönderim geçmişine düşer."""
    from app.modules.integrations import clients, service
    db = SessionLocal()
    try:
        ids = project_case_ids(db, cfg["projectId"])
    finally:
        db.close()

    def log(ok, msg, ref=None):
        s = SessionLocal()
        try:
            service.log_event(s, "github", event, ok, msg, ref or sha[:7])
        finally:
            s.close()

    if not ids:
        log(False, f"{ref_label}: projede koşulacak otomasyon case'i yok.")
        return
    report = cfg.get("reportStatus", True)
    if report:
        try:
            clients.github_status(cfg, sha, "pending", f"{len(ids)} otomasyon testi koşuluyor", None)
        except clients.IntegrationError as e:
            log(False, f"Commit durumu yazılamadı: {e}")
            report = False
    try:
        summary = asyncio.run(core.execute(
            {"cases": ids, "browser": "Chrome", "headless": True, "environment_id": cfg.get("environmentId")},
            None, _log_emit, asyncio.Event(), trigger={"source": "github", "event": event, "sha": sha, "ref": ref_label}))
    except core.StartError as e:
        log(False, f"{ref_label}: koşum başlatılamadı: {e}")
        if report:
            try:
                clients.github_status(cfg, sha, "error", f"Koşum başlatılamadı: {e}", None)
            except clients.IntegrationError:
                pass
        return
    if not summary:
        log(False, f"{ref_label}: koşum tamamlanamadı.")
        return
    c = summary["counts"]
    url = f"{service.app_url()}/test-runs/{summary['run_id']}" if summary["run_id"] else None
    desc = f"{c['passed']} geçti, {c['failed']} kaldı" + (f", {c['skipped']} atlandı" if c["skipped"] else "")
    log(c["failed"] == 0, f"{ref_label} → KS-{summary['run_id']}: {desc}", f"KS-{summary['run_id']}")
    if report:
        try:
            clients.github_status(cfg, sha, "failure" if c["failed"] else "success", desc, url)
        except clients.IntegrationError as e:
            log(False, f"Commit durumu yazılamadı: {e}")


@router.post("/webhooks/github", status_code=202)
async def github_webhook(request: Request):
    from app.modules.integrations import clients, hooks, service
    body = await request.body()
    db = SessionLocal()
    try:
        active, cfg = service.stored(db, "github")
    finally:
        db.close()
    if not active:
        raise HTTPException(status_code=404, detail="GitHub entegrasyonu kapalı.")
    if not clients.github_signature_ok(cfg.get("githubSecret") or "", body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=401, detail="Webhook imzası doğrulanamadı.")
    event = request.headers.get("X-GitHub-Event", "")
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz JSON.")

    if event == "ping":
        return {"ok": True, "message": "NG Test webhook'u hazır."}
    if not cfg.get("projectId"):
        return {"ok": False, "message": "Entegrasyon ayarlarında proje seçilmemiş; koşum başlatılmadı."}

    sha, label = None, None
    if event == "push" and cfg.get("triggerOn", "push") == "push":
        branch = cfg.get("githubBranch") or "main"
        if payload.get("ref") != f"refs/heads/{branch}" or payload.get("deleted"):
            return {"ok": True, "message": f"Yalnız '{branch}' dalına push koşum başlatır; yok sayıldı."}
        sha, label = payload.get("after"), f"push {branch}@{(payload.get('after') or '')[:7]}"
    elif event == "deployment_status" and cfg.get("triggerOn") == "deployment":
        st = (payload.get("deployment_status") or {}).get("state")
        if st != "success":
            return {"ok": True, "message": f"Deployment durumu '{st}'; yalnız 'success' koşum başlatır."}
        dep = payload.get("deployment") or {}
        sha, label = dep.get("sha"), f"deployment {dep.get('environment', '')}@{(dep.get('sha') or '')[:7]}".strip()
    else:
        return {"ok": True, "message": f"'{event}' olayı bu ayarla koşum başlatmaz; yok sayıldı."}
    if not sha:
        raise HTTPException(status_code=400, detail="Olayda commit bilgisi yok.")

    await asyncio.to_thread(hooks.dispatch, _github_job, cfg, sha, event, label)
    return {"ok": True, "message": "Otomasyon koşumu başlatıldı.", "sha": sha}
