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


def test_atama_gecmis_ve_yorumlar(client, admin, project, make_user, login):
    make_user("tess", role="tester"); make_user("dev", role="tester"); make_user("vic")
    T, V = login("tess"), login("vic")
    users = {u["username"]: u["id"] for u in client.get("/defects/assignees", headers=V).json()}
    assert {"tess", "dev", "vic"} <= set(users)

    d = client.post("/defects/", json={"title": "Ödeme", "project_id": project["id"], "assignee_id": users["dev"]}, headers=T).json()
    assert d["assignee_id"] == users["dev"] and d["assignee_name"] == "dev" and d["resolved_at"] is None

    # Durum, önem ve atama değişiklikleri geçmişe yazılır
    r = client.patch(f"/defects/{d['id']}", json={"status": "Resolved", "severity": "Kritik", "assignee_id": users["tess"]}, headers=T).json()
    assert r["status"] == "Resolved" and r["resolved_at"] and r["assignee_name"] == "tess"
    # Değişmeyen alan geçmişe yazılmaz
    client.patch(f"/defects/{d['id']}", json={"severity": "Kritik"}, headers=T)
    kinds = [(a["kind"], a["from_value"], a["to_value"], a["user_name"]) for a in client.get(f"/defects/{d['id']}/activity", headers=V).json()]
    assert kinds[0][0] == "created"
    assert ("status", "Open", "Resolved", "tess") in kinds and ("severity", "Orta", "Kritik", "tess") in kinds
    assert ("assignee", "dev", "tess", "tess") in kinds and len(kinds) == 5

    # Yorumlar: izin, düzenleme ve silme sahipliği
    assert client.post(f"/defects/{d['id']}/comments", json={"body": "x"}, headers=V).status_code == 403
    assert client.post(f"/defects/{d['id']}/comments", json={"body": "   "}, headers=T).status_code == 422
    c = client.post(f"/defects/{d['id']}/comments", json={"body": "Tekrar edemedim"}, headers=T).json()
    D = login("dev")
    assert client.patch(f"/defects/{d['id']}/comments/{c['id']}", json={"body": "y"}, headers=D).status_code == 403
    e = client.patch(f"/defects/{d['id']}/comments/{c['id']}", json={"body": "Tekrar ettim"}, headers=T).json()
    assert e["body"] == "Tekrar ettim" and e["updated_at"]
    assert client.get(f"/defects/{d['id']}", headers=V).json()["comment_count"] == 1
    assert client.delete(f"/defects/{d['id']}/comments/{c['id']}", headers=D).status_code == 403
    assert client.delete(f"/defects/{d['id']}/comments/{c['id']}", headers=admin).status_code == 200
    assert client.get(f"/defects/{d['id']}", headers=V).json()["comment_count"] == 0

    # Statü çözülmüşten geri alınınca resolved_at temizlenir
    assert client.patch(f"/defects/{d['id']}", json={"status": "Re-test"}, headers=T).json()["resolved_at"] is None


def test_atama_filtreleri_ve_toplu_atama(client, admin, project, make_user, login):
    make_user("tess", role="tester"); make_user("off", role="tester")
    T = login("tess")
    ids = [client.post("/defects/", json={"title": f"D{i}", "project_id": project["id"]}, headers=T).json()["id"] for i in range(3)]
    users = {u["username"]: u["id"] for u in client.get("/defects/assignees", headers=T).json()}
    r = client.post("/defects/bulk-assign", json={"ids": ids[:2], "assignee_id": users["tess"]}, headers=T).json()
    assert r["updated"] == 2
    assert client.post("/defects/bulk-assign", json={"ids": ids[:2], "assignee_id": users["tess"]}, headers=T).json()["updated"] == 0
    mine = client.get("/defects/", params={"assignee_id": users["tess"]}, headers=T).json()
    assert sorted(d["id"] for d in mine) == sorted(ids[:2])
    assert [d["id"] for d in client.get("/defects/", params={"unassigned": True}, headers=T).json()] == [ids[2]]

    # Devre dışı veya olmayan kullanıcıya atama yapılamaz
    client.put(f"/users/{users['off']}", json={"is_active": False}, headers=admin)
    assert "off" not in {u["username"] for u in client.get("/defects/assignees", headers=T).json()}
    assert client.patch(f"/defects/{ids[2]}", json={"assignee_id": users["off"]}, headers=T).status_code == 400
    assert client.post("/defects/bulk-assign", json={"ids": ids, "assignee_id": 9999}, headers=T).status_code == 400
    # Atamayı kaldırma
    assert client.post("/defects/bulk-assign", json={"ids": ids[:1], "assignee_id": None}, headers=T).json()["updated"] == 1
    # Toplu statü de geçmişe yazılır
    client.post("/defects/bulk-status", json={"ids": ids, "status": "In Progress"}, headers=T)
    acts = client.get(f"/defects/{ids[0]}/activity", headers=T).json()
    assert [a["kind"] for a in acts] == ["created", "assignee", "assignee", "status"]


def test_otomatik_defect_yeniden_acilinca_gecmise_yazilir(client, admin, project):
    a = _case(client, admin, project["id"], "A")
    res = [{"case_id": a, "status": "Failed"}]
    run = client.post("/test-runs/", json={"name": "Gece", "project_id": project["id"], "results": json.dumps(res)}, headers=admin).json()
    d = client.get("/defects/", headers=admin).json()[0]
    client.patch(f"/defects/{d['id']}", json={"status": "Resolved"}, headers=admin)
    res[0]["actual_result"] = "yine"
    client.put(f"/test-runs/{run['id']}", json={"name": "Gece", "project_id": project["id"], "results": json.dumps(res)}, headers=admin)
    acts = client.get(f"/defects/{d['id']}/activity", headers=admin).json()
    assert [a["kind"] for a in acts] == ["created", "status", "reopened"]
    assert acts[0]["user_id"] is None and acts[-1]["user_id"] is None and "Gece" in acts[-1]["body"]
    assert client.get(f"/defects/{d['id']}", headers=admin).json()["resolved_at"] is None
    # Defect silinince geçmiş de silinir
    client.delete(f"/defects/{d['id']}", headers=admin)
    assert client.get(f"/defects/{d['id']}/activity", headers=admin).status_code == 404
