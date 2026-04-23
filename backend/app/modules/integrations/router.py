# backend/app/modules/integrations/router.py
"""
Entegrasyon endpoint'leri.
Her provider (slack, jira, github) için:
  GET  /integrations/           → Tüm entegrasyon ayarlarını getir
  PUT  /integrations/{provider} → Entegrasyon ayarını kaydet/güncelle
  POST /integrations/{provider}/test → Bağlantıyı test et
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.modules.integrations.models import Integration
from app.modules.integrations.schemas import IntegrationUpsert, IntegrationResponse

router = APIRouter(prefix="/integrations", tags=["integrations"])

PROVIDERS = {"slack", "jira", "github"}


# ── Tüm entegrasyonları getir ─────────────────────────────────
@router.get("/", response_model=list[IntegrationResponse])
def get_all_integrations(db: Session = Depends(get_db)):
    rows = db.query(Integration).all()
    # Kayıt yoksa boş liste — frontend defaults ile çalışır
    return rows


# ── Entegrasyonu kaydet / güncelle ────────────────────────────
@router.put("/{provider}", response_model=IntegrationResponse)
def upsert_integration(
    provider: str,
    payload: IntegrationUpsert,
    db: Session = Depends(get_db),
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Geçersiz provider: {provider}")

    row = db.query(Integration).filter(Integration.provider == provider).first()
    if row:
        row.is_active = payload.is_active
        row.config    = payload.config
    else:
        row = Integration(provider=provider, is_active=payload.is_active, config=payload.config)
        db.add(row)

    db.commit()
    db.refresh(row)
    return row


# ── Bağlantıyı test et ────────────────────────────────────────
@router.post("/{provider}/test")
async def test_integration(
    provider: str,
    payload: IntegrationUpsert,
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Geçersiz provider: {provider}")

    config = payload.config or {}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:

            # ── SLACK ──────────────────────────────────────────
            if provider == "slack":
                webhook = config.get("slackWebhook", "").strip()
                if not webhook:
                    raise HTTPException(status_code=422, detail="Slack Webhook URL boş olamaz.")
                res = await client.post(webhook, json={"text": "✅ NG Test — Slack bağlantısı başarılı!"})
                if res.status_code not in (200, 204):
                    raise HTTPException(status_code=502, detail=f"Slack yanıtı: {res.status_code} — Webhook URL'ini kontrol edin.")

            # ── JIRA ───────────────────────────────────────────
            elif provider == "jira":
                url   = config.get("jiraUrl", "").strip().rstrip("/")
                email = config.get("jiraEmail", "").strip()
                token = config.get("jiraToken", "").strip()
                if not all([url, email, token]):
                    raise HTTPException(status_code=422, detail="Jira URL, e-posta ve token zorunludur.")
                res = await client.get(
                    f"{url}/rest/api/3/myself",
                    auth=(email, token),
                    headers={"Accept": "application/json"},
                )
                if res.status_code == 401:
                    raise HTTPException(status_code=401, detail="Jira kimlik doğrulama başarısız — e-posta veya token hatalı.")
                if res.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Jira yanıtı: {res.status_code}")

            # ── GITHUB ─────────────────────────────────────────
            elif provider == "github":
                repo  = config.get("githubRepo", "").strip()
                token = config.get("githubToken", "").strip()
                if not all([repo, token]):
                    raise HTTPException(status_code=422, detail="GitHub repo ve token zorunludur.")
                res = await client.get(
                    f"https://api.github.com/repos/{repo}",
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                )
                if res.status_code == 401:
                    raise HTTPException(status_code=401, detail="GitHub token geçersiz veya süresi dolmuş.")
                if res.status_code == 404:
                    raise HTTPException(status_code=404, detail=f"Repo bulunamadı: {repo} — Repo adını veya erişim iznini kontrol edin.")
                if res.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"GitHub yanıtı: {res.status_code}")

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"{provider.upper()} servisine bağlanılamadı — zaman aşımı (8s).")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bağlantı hatası: {str(e)}")

    return {"success": True, "message": f"{provider.upper()} bağlantısı başarılı!"}