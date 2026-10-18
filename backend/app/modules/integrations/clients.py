"""
Slack, Jira ve GitHub HTTP istemcileri. Hepsi senkron ve kısa zaman aşımlı; çağıranlar arka planda çalışır.
Testler `transport` değişkenine httpx.MockTransport atayarak dış ağa çıkmadan çalışır.
"""
import hashlib
import hmac
from typing import Optional

import httpx

transport: Optional[httpx.BaseTransport] = None
TIMEOUT = 10.0


class IntegrationError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _client(**kw) -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, transport=transport, **kw)


def _call(fn, label: str):
    try:
        return fn()
    except IntegrationError:
        raise
    except httpx.TimeoutException:
        raise IntegrationError(f"{label} yanıt vermedi (zaman aşımı).", 504)
    except httpx.HTTPError as e:
        raise IntegrationError(f"{label} bağlantı hatası: {e}", 502)


# ── Slack ─────────────────────────────────────────────────────────

def slack_post(cfg: dict, text: str, blocks: Optional[list] = None):
    url = (cfg.get("slackWebhook") or "").strip()
    if not url.startswith("https://"):
        raise IntegrationError("Slack webhook adresi https:// ile başlamalı.", 422)
    body = {"text": text}
    if blocks:
        body["blocks"] = blocks
    if cfg.get("slackChannel"):
        body["channel"] = cfg["slackChannel"]

    def go():
        with _client() as c:
            r = c.post(url, json=body)
        if r.status_code not in (200, 204):
            raise IntegrationError(f"Slack {r.status_code} döndü: {r.text[:200]}")
    _call(go, "Slack")


# ── Jira ──────────────────────────────────────────────────────────

def _jira(cfg: dict):
    url, email, token = (cfg.get("jiraUrl") or "").strip().rstrip("/"), (cfg.get("jiraEmail") or "").strip(), (cfg.get("jiraToken") or "").strip()
    if not (url and email and token):
        raise IntegrationError("Jira adresi, e-posta ve API token zorunludur.", 422)
    if not url.startswith("https://"):
        raise IntegrationError("Jira adresi https:// ile başlamalı.", 422)
    return url, (email, token)


def jira_check(cfg: dict) -> str:
    url, auth = _jira(cfg)
    key = (cfg.get("jiraProjectKey") or "").strip()

    def go():
        with _client(auth=auth, headers={"Accept": "application/json"}) as c:
            r = c.get(f"{url}/rest/api/3/myself")
            if r.status_code == 401:
                raise IntegrationError("Jira kimlik doğrulaması başarısız (e-posta veya token hatalı).", 401)
            if r.status_code != 200:
                raise IntegrationError(f"Jira {r.status_code} döndü.")
            who = r.json().get("displayName") or "hesap"
            if key:
                p = c.get(f"{url}/rest/api/3/project/{key}")
                if p.status_code == 404:
                    raise IntegrationError(f"Jira'da '{key}' anahtarlı proje bulunamadı ya da erişim yok.", 404)
                if p.status_code != 200:
                    raise IntegrationError(f"Jira proje sorgusu {p.status_code} döndü.")
            return who
    return _call(go, "Jira")


def _adf(text: str) -> dict:
    """Düz metni Jira'nın belge biçimine (ADF) çevirir: her satır bir paragraf."""
    paras = []
    for line in (text or "").split("\n"):
        paras.append({"type": "paragraph", "content": [{"type": "text", "text": line}] if line else []})
    return {"type": "doc", "version": 1, "content": paras or [{"type": "paragraph", "content": []}]}


PRIORITY = {"Kritik": "Highest", "Yüksek": "High", "Orta": "Medium", "Düşük": "Low"}


def jira_create_issue(cfg: dict, summary: str, description: str, severity: Optional[str], labels: list[str]) -> tuple[str, str]:
    url, auth = _jira(cfg)
    key = (cfg.get("jiraProjectKey") or "").strip()
    if not key:
        raise IntegrationError("Jira proje anahtarı (ör. QA) girilmemiş.", 422)
    fields = {
        "project": {"key": key},
        "summary": summary[:250],
        "description": _adf(description),
        "issuetype": {"name": (cfg.get("jiraIssueType") or "Bug").strip()},
        "labels": labels,
    }
    if severity in PRIORITY and cfg.get("jiraSetPriority", True):
        fields["priority"] = {"name": PRIORITY[severity]}

    def go():
        with _client(auth=auth, headers={"Accept": "application/json"}) as c:
            r = c.post(f"{url}/rest/api/3/issue", json={"fields": fields})
            if r.status_code == 400 and "priority" in fields and "priority" in r.text:
                # Projenin ekranında öncelik alanı yoksa önceliksiz tekrar dene
                fields.pop("priority")
                r = c.post(f"{url}/rest/api/3/issue", json={"fields": fields})
        if r.status_code == 401:
            raise IntegrationError("Jira kimlik doğrulaması başarısız.", 401)
        if r.status_code not in (200, 201):
            try:
                errs = r.json()
                msg = "; ".join(list(errs.get("errorMessages") or []) + [f"{k}: {v}" for k, v in (errs.get("errors") or {}).items()])
            except ValueError:
                msg = r.text[:200]
            raise IntegrationError(f"Jira kaydı açılamadı ({r.status_code}): {msg}")
        issue_key = r.json()["key"]
        return issue_key, f"{url}/browse/{issue_key}"
    return _call(go, "Jira")


# ── GitHub ────────────────────────────────────────────────────────

def _gh(cfg: dict):
    repo, token = (cfg.get("githubRepo") or "").strip(), (cfg.get("githubToken") or "").strip()
    if not repo or "/" not in repo:
        raise IntegrationError("GitHub deposu 'sahip/depo' biçiminde olmalı.", 422)
    if not token:
        raise IntegrationError("GitHub erişim token'ı girilmemiş.", 422)
    return repo, {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def github_check(cfg: dict) -> str:
    repo, headers = _gh(cfg)

    def go():
        with _client(headers=headers) as c:
            r = c.get(f"https://api.github.com/repos/{repo}")
        if r.status_code == 401:
            raise IntegrationError("GitHub token geçersiz veya süresi dolmuş.", 401)
        if r.status_code == 404:
            raise IntegrationError(f"'{repo}' deposu bulunamadı ya da token'ın erişimi yok.", 404)
        if r.status_code != 200:
            raise IntegrationError(f"GitHub {r.status_code} döndü.")
        return r.json().get("full_name", repo)
    return _call(go, "GitHub")


def github_status(cfg: dict, sha: str, state: str, description: str, target_url: Optional[str]):
    """Commit'e durum yazar (state: pending | success | failure | error)."""
    repo, headers = _gh(cfg)
    body = {"state": state, "description": description[:140], "context": "NG Test / otomasyon"}
    if target_url:
        body["target_url"] = target_url

    def go():
        with _client(headers=headers) as c:
            r = c.post(f"https://api.github.com/repos/{repo}/statuses/{sha}", json=body)
        if r.status_code not in (200, 201):
            raise IntegrationError(f"GitHub commit durumu yazılamadı ({r.status_code}).")
    _call(go, "GitHub")


def github_signature_ok(secret: str, body: bytes, header: Optional[str]) -> bool:
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
