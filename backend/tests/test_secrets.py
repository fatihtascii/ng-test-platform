"""Entegrasyon token'ları ve secret değişkenler API'de açık dönmemeli."""
from app.db.database import SessionLocal
from app.modules.integrations import service as isvc

TOKEN = "ATATT3xFfGF0-gercek-jira-token-9f8e"


def test_entegrasyon_tokeni_maskeli(client, admin):
    cfg = {"jiraUrl": "https://acme.atlassian.net", "jiraEmail": "a@b.co", "jiraToken": TOKEN}
    r = client.put("/integrations/jira", json={"is_active": True, "config": cfg}, headers=admin)
    assert r.status_code == 200 and TOKEN not in r.text
    got = next(x for x in client.get("/integrations/", headers=admin).json() if x["provider"] == "jira")
    assert got["config"]["jiraToken"].startswith("••••") and got["config"]["jiraToken"].endswith("9f8e")

    # maskeli değerle kaydetmek gerçek token'ı korur
    got["config"]["jiraProjectKey"] = "NG"
    client.put("/integrations/jira", json={"is_active": True, "config": got["config"]}, headers=admin)
    db = SessionLocal()
    try:
        assert isvc._stored_config(db, "jira")["jiraToken"] == TOKEN
        assert isvc.resolve_secrets(db, "jira", got["config"])["jiraToken"] == TOKEN
    finally:
        db.close()


def test_secret_degisken_viewer_icin_maskeli(client, admin, project, make_user, login):
    env = client.post("/environments/", json={"name": "dev", "project_id": project["id"], "url": "https://d"}, headers=admin).json()
    client.post("/variables/", json={"key": "PASS", "value": "SuperGizli!2026", "env_id": env["id"], "is_secret": True}, headers=admin)
    make_user("vic")
    vv = {v["key"]: v["value"] for v in client.get("/variables/", headers=login("vic")).json()}
    av = {v["key"]: v["value"] for v in client.get("/variables/", headers=admin).json()}
    assert "Gizli" not in vv["PASS"] and "2026" not in vv["PASS"]
    # Listede yönetici de maskeli görür; değer yalnızca tek tek açılır
    assert "Gizli" not in av["PASS"]
    var = next(v for v in client.get("/variables/", headers=admin).json() if v["key"] == "PASS")
    assert client.get(f"/variables/{var['id']}/value", headers=admin).json()["value"] == "SuperGizli!2026"
    assert client.get(f"/variables/{var['id']}/value", headers=login("vic")).status_code == 403
    # Maskeli değerle güncelleme gerçek değeri korur
    client.put(f"/variables/{var['id']}", json={**var, "value": var["value"], "key": "PASS"}, headers=admin)
    assert client.get(f"/variables/{var['id']}/value", headers=admin).json()["value"] == "SuperGizli!2026"
