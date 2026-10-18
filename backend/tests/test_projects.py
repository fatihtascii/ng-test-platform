"""Projeler: doğrulama, benzersiz ad, kısmi güncelleme, istatistikler ve silme."""
import json


def test_dogrulama_ve_benzersiz_ad(client, admin):
    assert client.post("/projects/", json={"name": "   "}, headers=admin).status_code == 422
    assert client.post("/projects/", json={"name": "X", "status": "Bozuk"}, headers=admin).status_code == 422
    p = client.post("/projects/", json={"name": "  Web   mağaza ", "description": "  "}, headers=admin).json()
    assert p["name"] == "Web mağaza" and p["description"] is None and p["status"] == "Aktif" and p["created_at"]
    assert client.post("/projects/", json={"name": "WEB MAĞAZA"}, headers=admin).status_code == 409
    client.post("/projects/", json={"name": "İzmir"}, headers=admin)
    assert client.post("/projects/", json={"name": "izmir"}, headers=admin).status_code == 409
    q = client.post("/projects/", json={"name": "Mobil"}, headers=admin).json()
    assert client.put(f"/projects/{q['id']}", json={"name": "Web mağaza"}, headers=admin).status_code == 409
    # Kendi adıyla güncellemek serbest; kısmi güncelleme diğer alanlara dokunmaz
    client.put(f"/projects/{q['id']}", json={"description": "iOS ve Android"}, headers=admin)
    r = client.patch(f"/projects/{q['id']}", json={"status": "Beklemede"}, headers=admin).json()
    assert r["name"] == "Mobil" and r["description"] == "iOS ve Android" and r["status"] == "Beklemede"


def test_istatistikler(client, admin, project):
    pid = project["id"]
    ids = [client.post("/test-cases/", json={"title": f"C{i}", "project_id": pid,
                                            "execution_type": "Automated" if i == 0 else "Manual"}, headers=admin).json()["id"] for i in range(3)]
    client.post("/test-plans/", json={"title": "P", "project_id": pid}, headers=admin)
    client.post("/test-runs/", json={"name": "R", "project_id": pid,
                                     "results": json.dumps([{"case_id": ids[0], "status": "Failed"}])}, headers=admin)
    client.post("/defects/", json={"title": "D", "project_id": pid, "severity": "Kritik"}, headers=admin)
    other = client.post("/projects/", json={"name": "Boş"}, headers=admin).json()

    plain = client.get("/projects/", headers=admin).json()
    assert all(p["stats"] is None for p in plain)          # varsayılan liste hafif kalır
    stats = {p["id"]: p["stats"] for p in client.get("/projects/", params={"with_stats": True}, headers=admin).json()}
    s = stats[pid]
    assert s["cases"] == 3 and s["automated"] == 1 and s["plans"] == 1 and s["active_plans"] == 1
    assert s["runs"] == 1 and s["last_run_at"] and s["open_defects"] == 2 and s["critical_defects"] == 1
    assert sum(s["cases_by_status"].values()) == 3
    assert stats[other["id"]]["cases"] == 0 and stats[other["id"]]["last_run_at"] is None
    assert client.get(f"/projects/{pid}", params={"with_stats": True}, headers=admin).json()["stats"]["cases"] == 3


def test_silme_bagli_kayitlari_temizler(client, admin, project):
    pid = project["id"]
    c = client.post("/test-cases/", json={"title": "C", "project_id": pid}, headers=admin).json()["id"]
    client.post("/test-runs/", json={"name": "R", "project_id": pid, "results": json.dumps([{"case_id": c, "status": "Failed"}])}, headers=admin)
    d = client.get("/defects/", headers=admin).json()[0]
    client.post(f"/defects/{d['id']}/comments", json={"body": "x"}, headers=admin)
    assert client.delete(f"/projects/{pid}", headers=admin).status_code == 200
    assert client.get(f"/projects/{pid}", headers=admin).status_code == 404
    assert client.get("/defects/", headers=admin).json() == []
    assert client.get(f"/test-cases/{c}", headers=admin).status_code == 404


def test_yetki(client, admin, make_user, login, project):
    make_user("tess", role="tester")
    T = login("tess")
    assert client.get("/projects/", params={"with_stats": True}, headers=T).status_code == 200
    assert client.patch(f"/projects/{project['id']}", json={"status": "Beklemede"}, headers=T).status_code == 403
    assert client.delete(f"/projects/{project['id']}", headers=T).status_code == 403
