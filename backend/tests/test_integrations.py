"""Entegrasyonlar: Slack bildirimi, Jira aktarımı, GitHub webhook'u ve CI tetiklemesi (sahte HTTP ile)."""
import hashlib
import hmac
import json

import httpx
import pytest

from app.modules.integrations import clients

SLACK = "https://hooks.slack.com/services/T0/B0/XYZ"


@pytest.fixture
def http(monkeypatch):
    """Dış istekleri yakalar; yanıtlar `routes` sözlüğüyle ayarlanır: (method, url-başı) → (status, json)."""
    calls, routes = [], {}

    def handler(request: httpx.Request):
        calls.append(request)
        for (method, prefix), (status, body) in routes.items():
            if request.method == method and str(request.url).startswith(prefix):
                return httpx.Response(status, json=body)
        return httpx.Response(200, json={})
    monkeypatch.setattr(clients, "transport", httpx.MockTransport(handler))
    return calls, routes


def _slack(client, admin, **cfg):
    return client.put("/integrations/slack", json={"is_active": True, "config": {"slackWebhook": SLACK, **cfg}}, headers=admin)


def _run(client, admin, project, statuses, status="Tamamlandı", name="Gece"):
    ids = [client.post("/test-cases/", json={"title": f"C{i}", "project_id": project["id"]}, headers=admin).json()["id"] for i in range(len(statuses))]
    results = [{"case_id": c, "status": s} for c, s in zip(ids, statuses)]
    return client.post("/test-runs/", json={"name": name, "project_id": project["id"], "status": status, "results": json.dumps(results)}, headers=admin).json()


def test_slack_dogrulama_ve_baglanti_testi(client, admin, http):
    calls, routes = http
    bad = client.put("/integrations/slack", json={"is_active": True, "config": {"slackWebhook": "http://x"}}, headers=admin)
    assert bad.status_code == 422
    assert client.put("/integrations/slack", json={"is_active": True, "config": {}}, headers=admin).status_code == 422
    assert client.put("/integrations/slack", json={"config": {"notifyOn": "bazen"}}, headers=admin).status_code == 422
    r = _slack(client, admin).json()
    assert r["is_active"] and r["configured"] and SLACK not in json.dumps(r)
    assert client.post("/integrations/slack/test", json={"config": r["config"]}, headers=admin).json()["success"]
    assert str(calls[-1].url) == SLACK          # maskeli değer kayıtlı gerçek adresle değiştirildi
    routes[("POST", SLACK)] = (404, {"error": "no_service"})
    assert client.post("/integrations/slack/test", json={"config": r["config"]}, headers=admin).status_code == 502
    ev = client.get("/integrations/slack/events", headers=admin).json()
    assert [e["ok"] for e in ev[:2]] == [False, True]


def test_kosum_bitince_slack_bildirimi(client, admin, project, http):
    calls, routes = http
    _slack(client, admin)                                   # varsayılan: yalnız hata varsa
    _run(client, admin, project, ["Passed", "Passed"])
    assert calls == []
    run = _run(client, admin, project, ["Passed", "Failed"], name="Sürüm 4.2")
    assert len(calls) == 2                                  # koşum + yeni hata kaydı bildirimi
    texts = [json.loads(c.content)["text"] for c in calls]
    assert any(f"KS-{run['id']}" in t and "1 kaldı" in t for t in texts) and any("BUG-" in t for t in texts)

    calls.clear()
    _slack(client, admin, notifyOn="all", notifyDefects=False)
    r = _run(client, admin, project, ["Passed"], status="Aktif")
    assert calls == []                                      # bitmemiş koşum bildirilmez
    body = {"name": "Gece", "project_id": project["id"], "status": "Tamamlandı", "results": r["results"]}
    client.put(f"/test-runs/{r['id']}", json=body, headers=admin)
    client.put(f"/test-runs/{r['id']}", json=body, headers=admin)
    assert len(calls) == 1                                  # yalnız bitişe geçişte, bir kez

    routes[("POST", SLACK)] = (500, {})
    assert client.put(f"/test-runs/{r['id']}", json={**body, "status": "Aktif"}, headers=admin).status_code == 200
    resp = client.put(f"/test-runs/{r['id']}", json=body, headers=admin)
    assert resp.status_code == 200                          # Slack hatası koşumu bozmaz
    assert client.get("/integrations/slack/events", headers=admin).json()[0]["ok"] is False


def test_jira_aktarim_elle_ve_otomatik(client, admin, project, http, make_user, login):
    calls, routes = http
    base = "https://acme.atlassian.net"
    routes[("POST", f"{base}/rest/api/3/issue")] = (201, {"key": "QA-7"})
    d = client.post("/defects/", json={"title": "Sepet boşalıyor", "project_id": project["id"], "severity": "Kritik"}, headers=admin).json()
    assert client.post(f"/defects/{d['id']}/jira", headers=admin).status_code == 409      # entegrasyon kapalı
    cfg = {"jiraUrl": base + "/", "jiraEmail": "qa@acme.co", "jiraToken": "tok-123456789", "jiraProjectKey": "qa"}
    assert client.put("/integrations/jira", json={"is_active": True, "config": cfg}, headers=admin).status_code == 200

    make_user("vic")
    assert client.post(f"/defects/{d['id']}/jira", headers=login("vic")).status_code == 403
    r = client.post(f"/defects/{d['id']}/jira", headers=admin).json()
    assert r["external_key"] == "QA-7" and r["external_url"] == f"{base}/browse/QA-7"
    sent = json.loads(calls[-1].content)["fields"]
    assert sent["project"] == {"key": "QA"} and sent["priority"] == {"name": "Highest"} and sent["summary"].startswith(f"[BUG-{d['id']}]")
    assert sent["issuetype"] == {"name": "Bug"} and "ng-test" in sent["labels"]
    n = len(calls)
    assert client.post(f"/defects/{d['id']}/jira", headers=admin).json()["external_key"] == "QA-7"
    assert len(calls) == n                                  # ikinci kez açılmaz
    acts = client.get(f"/defects/{d['id']}/activity", headers=admin).json()
    assert acts[-1]["kind"] == "external" and acts[-1]["to_value"] == "QA-7"

    # Otomatik: koşumdan doğan hata kaydı Jira'ya aktarılır
    client.put("/integrations/jira", json={"is_active": True, "config": {"autoCreate": True}}, headers=admin)
    routes[("POST", f"{base}/rest/api/3/issue")] = (201, {"key": "QA-8"})
    _run(client, admin, project, ["Failed"])
    auto = next(x for x in client.get("/defects/", headers=admin).json() if x["source"] == "auto")
    assert auto["external_key"] == "QA-8"

    # Jira hatası: anlaşılır mesaj, kayıt geçmişte
    routes[("POST", f"{base}/rest/api/3/issue")] = (400, {"errorMessages": [], "errors": {"summary": "zorunlu"}})
    d2 = client.post("/defects/", json={"title": "Başka", "project_id": project["id"]}, headers=admin).json()
    r = client.post(f"/defects/{d2['id']}/jira", headers=admin)
    assert r.status_code == 502 and "summary: zorunlu" in r.json()["detail"]
    assert client.get("/integrations/jira/events", headers=admin).json()[0]["ok"] is False


def test_durum_ozeti_herkese_acik(client, admin, make_user, login, http):
    make_user("vic")
    assert client.get("/integrations/", headers=login("vic")).status_code == 403
    assert client.get("/integrations/status", headers=login("vic")).json() == {"slack": False, "jira": False, "github": False}
    _slack(client, admin)
    assert client.get("/integrations/status", headers=login("vic")).json()["slack"] is True


# ── GitHub ve CI (gerçek pytest alt süreci) ───────────────────────

pw = pytest.importorskip("pytest_playwright")


def _sign(secret, body):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _hook(client, event, payload, secret="s3cr3t", sig=None):
    body = json.dumps(payload).encode()
    return client.post("/webhooks/github", content=body, headers={
        "X-GitHub-Event": event, "X-Hub-Signature-256": sig or _sign(secret, body), "Content-Type": "application/json"})


def test_github_webhook_kosum_ve_commit_durumu(client, admin, project, http):
    calls, routes = http
    for t, script in (("Geçen", "def test_ok():\n    assert True\n"), ("Kalan", "def test_bad():\n    assert False\n")):
        client.post("/test-cases/", json={"title": t, "project_id": project["id"], "execution_type": "Automated", "automation_script": script}, headers=admin)
    cfg = {"githubRepo": "acme/shop", "githubToken": "ghp_x", "githubBranch": "main", "projectId": project["id"]}
    assert _hook(client, "ping", {}).status_code == 404                                   # kapalı
    assert client.put("/integrations/github", json={"is_active": True, "config": cfg}, headers=admin).status_code == 422   # secret yok
    cfg["githubSecret"] = "s3cr3t"
    assert client.put("/integrations/github", json={"is_active": True, "config": cfg}, headers=admin).status_code == 200

    assert _hook(client, "ping", {}, sig="sha256=bozuk").status_code == 401
    assert _hook(client, "ping", {}).json()["ok"] is True
    assert "yok sayıldı" in _hook(client, "push", {"ref": "refs/heads/dev", "after": "a" * 40}).json()["message"]
    assert client.get("/test-runs/", headers=admin).json() == []

    sha = "abc1234" + "0" * 33
    r = _hook(client, "push", {"ref": "refs/heads/main", "after": sha})
    assert r.status_code == 202 and r.json()["sha"] == sha
    runs = client.get("/test-runs/", params={"source": "automation"}, headers=admin).json()
    assert len(runs) == 1 and runs[0]["meta"]["trigger"]["source"] == "github" and runs[0]["created_by"] is None
    statuses = [json.loads(c.content) for c in calls if "/statuses/" in str(c.url)]
    assert [s["state"] for s in statuses] == ["pending", "failure"] and str(runs[0]["id"]) in statuses[-1]["target_url"]
    assert all(str(c.url).endswith(sha) for c in calls if "/statuses/" in str(c.url))
    ev = client.get("/integrations/github/events", headers=admin).json()
    assert ev[0]["ref"] == f"KS-{runs[0]['id']}" and ev[0]["ok"] is False and "1 kaldı" in ev[0]["message"]


def test_ci_tetikleme_uc_noktasi(client, admin, project, make_user, login, http):
    client.post("/test-cases/", json={"title": "Geçen", "project_id": project["id"], "execution_type": "Automated",
                                       "automation_script": "def test_ok():\n    assert True\n"}, headers=admin)
    make_user("tess", role="tester")
    assert client.post("/automation/runs", json={"project_id": project["id"]}, headers=login("tess")).status_code == 403
    r = client.post("/automation/runs", json={"project_id": project["id"]}, headers=admin).json()
    assert r["passed"] is True and r["counts"] == {"passed": 1, "failed": 0, "skipped": 0} and r["url"].endswith(f"/test-runs/{r['run_id']}")
    other = client.post("/projects/", json={"name": "Boş"}, headers=admin).json()
    assert client.post("/automation/runs", json={"project_id": other["id"]}, headers=admin).status_code == 422
