"""
Entegrasyon endpoint'leri.

DÜZELTMELER:
- GET / artık service.get_all_integrations kullanıyor (router'da inline
  sorgulama yerine service katmanı).
- PUT /{provider} service.upsert_integration'ı çağırıyor (tekrar eden
  upsert logic kaldırıldı).
- POST /{provider}/test yalnızca dış bağlantı testini yapıyor — DB'ye
  dokunmuyor (doğru sorumluluk ayrımı).
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.modules.integrations import service
from app.modules.integrations.schemas import IntegrationUpsert, IntegrationResponse

router = APIRouter(prefix="/integrations", tags=["Integrations"])

PROVIDERS = {"slack", "jira", "github"}


@router.get("/", dependencies=[Depends(require_permission("integrations.view"))], response_model=list[IntegrationResponse])
def get_all_integrations(db: Session = Depends(get_db)):
    return service.get_all_integrations(db)


@router.get("/{provider}", dependencies=[Depends(require_permission("integrations.view"))], response_model=IntegrationResponse)
def get_integration(provider: str, db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Geçersiz provider: {provider}")
    return service.get_integration(db, provider)


@router.put("/{provider}", dependencies=[Depends(require_permission("integrations.manage"))], response_model=IntegrationResponse)
def upsert_integration(
    provider: str,
    payload: IntegrationUpsert,
    db: Session = Depends(get_db),
):
    return service.upsert_integration(db, provider, payload)


@router.post("/{provider}/test", dependencies=[Depends(require_permission("integrations.manage"))])
async def test_integration(provider: str, payload: IntegrationUpsert, db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Geçersiz provider: {provider}")

    # Form maskeli token gönderdiyse kayıtlı gerçek değerle test et
    config = service.resolve_secrets(db, provider, payload.config)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:

            if provider == "slack":
                webhook = config.get("slackWebhook", "").strip()
                if not webhook:
                    raise HTTPException(status_code=422, detail="Slack Webhook URL boş olamaz.")
                res = await client.post(webhook, json={"text": "✅ NG Test — Slack bağlantısı başarılı!"})
                if res.status_code not in (200, 204):
                    raise HTTPException(
                        status_code=502,
                        detail=f"Slack yanıtı: {res.status_code} — Webhook URL'ini kontrol edin.",
                    )

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
                    raise HTTPException(status_code=401, detail="Jira kimlik doğrulama başarısız.")
                if res.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Jira yanıtı: {res.status_code}")

            elif provider == "github":
                repo  = config.get("githubRepo", "").strip()
                token = config.get("githubToken", "").strip()
                if not all([repo, token]):
                    raise HTTPException(status_code=422, detail="GitHub repo ve token zorunludur.")
                res = await client.get(
                    f"https://api.github.com/repos/{repo}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/vnd.github+json",
                    },
                )
                if res.status_code == 401:
                    raise HTTPException(status_code=401, detail="GitHub token geçersiz veya süresi dolmuş.")
                if res.status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Repo bulunamadı: {repo}",
                    )
                if res.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"GitHub yanıtı: {res.status_code}")

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"{provider.upper()} servisine bağlanılamadı — zaman aşımı (8s).",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bağlantı hatası: {str(e)}")

    return {"success": True, "message": f"{provider.upper()} bağlantısı başarılı!"}
