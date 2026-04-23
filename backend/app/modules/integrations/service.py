import json
import httpx
from sqlalchemy.orm import Session
from fastapi import HTTPException
from . import models, schemas

def get_integration(db: Session, provider: str):
    db_obj = db.query(models.Integration).filter(models.Integration.provider == provider).first()
    if not db_obj:
        # Yoksa varsayılan boş bir kayıt dön (frontend patlamasın)
        return {"provider": provider, "is_active": False, "config": {}}
    return {"provider": db_obj.provider, "is_active": db_obj.is_active, "config": json.loads(db_obj.config or "{}")}

def get_all_integrations(db: Session):
    providers = ["slack", "jira", "github"]
    return [get_integration(db, p) for p in providers]

def update_integration(db: Session, provider: str, data: schemas.IntegrationUpdate):
    db_obj = db.query(models.Integration).filter(models.Integration.provider == provider).first()
    if not db_obj:
        db_obj = models.Integration(provider=provider)
        db.add(db_obj)
    
    db_obj.is_active = data.is_active
    db_obj.config = json.dumps(data.config)
    db.commit()
    db.refresh(db_obj)
    return get_integration(db, provider)

# ── GERÇEK DIŞ BAĞLANTI TESTLERİ ──
async def test_slack_connection(config: dict):
    webhook_url = config.get("slackWebhook")
    if not webhook_url: raise ValueError("Webhook URL eksik.")
    
    payload = {"text": "✅ *NG Test API:* Slack entegrasyon bağlantısı başarıyla test edildi!"}
    async with httpx.AsyncClient() as client:
        response = await client.post(webhook_url, json=payload)
        if response.status_code != 200:
            raise ValueError("Slack reddetti. Webhook URL'sini kontrol edin.")
    return True

async def test_jira_connection(config: dict):
    url = config.get("jiraUrl", "").rstrip("/")
    email = config.get("jiraEmail")
    token = config.get("jiraToken")
    if not url or not email or not token: raise ValueError("Jira bilgileri eksik.")

    async with httpx.AsyncClient() as client:
        # Jira'da kendimi getir API'sini test için çağırıyoruz
        response = await client.get(f"{url}/rest/api/3/myself", auth=(email, token))
        if response.status_code != 200:
            raise ValueError("Jira kimlik doğrulaması başarısız.")
    return True

async def test_github_connection(config: dict):
    repo = config.get("githubRepo")
    token = config.get("githubToken")
    if not repo or not token: raise ValueError("GitHub bilgileri eksik.")

    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://api.github.com/repos/{repo}", headers=headers)
        if response.status_code != 200:
            raise ValueError("GitHub Repository bulunamadı veya yetki yok.")
    return True