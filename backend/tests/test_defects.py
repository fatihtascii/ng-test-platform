"""Sunucu tarafı defect takibi."""
import json


def _case(client, h, pid, title, priority="Orta"):
    return client.post("/test-cases/", json={"title": title, "project_id": pid, "priority": priority}, headers=h).json()["id"]


def test_basarisiz_kosum_otomatik_defect(client, admin, project):
    a = _case(client, admin, project["id"], "Giriş", "Kritik")
    b = _case(client, admin, project["id"], "Çıkış")
    results = [{"case_id": a, "status": "Failed", "actual_result": "500"}, {"case_id": b, "status": "Passed"}]
    run = client.post("/test-runs/", json={"name": "Gece", "project_id": project["id"], "results": json.dumps(results)}, headers=admin).json()

    defects = client.get("/defects/", headers=admin).json()
    assert len(defects) == 1
    d = defects[0]
    assert d["source"] == "auto" and d["test_run_id"] == run["id"] and d["severity"] == "Kritik"
    assert d["failed_count"] == 1 and d["failed_details"][0]["title"] == "Giriş" and d["code"] == f"BUG-{d['id']}"

    # Kullanıcı statüyü değiştirir; koşum güncellense bile statü korunur
    client.patch(f"/defects/{d['id']}", json={"status": "In Progress"}, headers=admin)
    results.append({"case_id": b, "status": "Failed"})
    client.put(f"/test-runs/{run['id']}", json={"name": "Gece", "project_id": project["id"], "results": json.dumps(results)}, headers=admin)
    d2 = client.get(f"/defects/{d['id']}", headers=admin).json()
    assert d2["status"] == "In Progress" and d2["failed_count"] == 2
    assert len(client.get("/defects/", headers=admin).json()) == 1   # aynı koşum için tek kayıt


def test_cozulen_defect_hata_tekrarlarsa_acilir(client, admin, project):
    a = _case(client, admin, project["id"], "A")
    res = [{"case_id": a, "status": "Failed"}]
    run = client.post("/test-runs/", json={"name": "R", "project_id": project["id"], "results": json.dumps(res)}, headers=admin).json()
    d = client.get("/defects/", headers=admin).json()[0]
    client.patch(f"/defects/{d['id']}", json={"status": "Resolved"}, headers=admin)
    res[0]["actual_result"] = "yine patladı"
    client.put(f"/test-runs/{run['id']}", json={"name": "R", "project_id": project["id"], "results": json.dumps(res)}, headers=admin)
    assert client.get(f"/defects/{d['id']}", headers=admin).json()["status"] == "Open"


def test_manuel_defect_crud_ve_yetki(client, admin, project, make_user, login):
    a = _case(client, admin, project["id"], "Sepet")
    make_user("tess", role="tester"); make_user("vic")
    T, V = login("tess"), login("vic")
    body = {"title": "Sepet boşalıyor", "description": "adımlar", "severity": "Yüksek", "project_id": project["id"], "test_case_id": a}
    assert client.post("/defects/", json=body, headers=V).status_code == 403
    r = client.post("/defects/", json=body, headers=T)
    assert r.status_code == 201
    d = r.json()
    assert d["source"] == "manual" and d["created_by_name"] == "tess" and d["failed_details"][0]["case_id"] == a
    assert client.patch(f"/defects/{d['id']}", json={"status": "Bozuk"}, headers=T).status_code == 422
    assert client.post("/defects/bulk-status", json={"ids": [d["id"]], "status": "Re-test"}, headers=T).json()["updated"] == 1
    assert client.get(f"/defects/{d['id']}", headers=V).json()["status"] == "Re-test"
    assert client.delete(f"/defects/{d['id']}", headers=T).status_code == 200
    assert client.get(f"/defects/{d['id']}", headers=V).status_code == 404


def test_eski_hatali_payload_reddedilir(client, admin, project):
    old = {"title": "x", "status": "Açık", "priority": "Yüksek", "project_id": project["id"]}
    assert client.post("/test-runs/", json=old, headers=admin).status_code == 422
