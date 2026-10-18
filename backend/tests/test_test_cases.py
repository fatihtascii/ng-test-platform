"""Test case uç noktaları: kısmi güncelleme, toplu silme, koşum geçmişi, statü senkronu."""
import json


def _case(client, h, pid, **extra):
    body = {"title": "Giriş", "project_id": pid, **extra}
    r = client.post("/test-cases/", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_guncelleme_gonderilmeyen_alanlari_korur(client, admin, project):
    tc = _case(client, admin, project["id"], tags='["smoke"]', execution_type="Automated",
               automation_script="print(1)")
    r = client.put(f"/test-cases/{tc['id']}", json={"title": "Yeni ad", "project_id": project["id"]}, headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Yeni ad"
    assert body["tags"] == '["smoke"]'            # önceden "[]" oluyordu
    assert body["execution_type"] == "Automated"
    assert body["automation_script"] == "print(1)"


def test_toplu_silme_plan_kalemlerini_temizler(client, admin, project):
    a, b = _case(client, admin, project["id"]), _case(client, admin, project["id"])
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    client.post(f"/test-plans/{plan['id']}/bulk-add", json={"test_case_ids": [a["id"], b["id"]]}, headers=admin)

    r = client.post("/test-cases/bulk/delete", json={"ids": [a["id"], b["id"], 999999]}, headers=admin)
    assert r.status_code == 200 and r.json()["deleted"] == 2
    plan = client.get(f"/test-plans/{plan['id']}", headers=admin).json()
    assert plan["items"] == []


def test_manuel_kosum_bitince_case_statusu_guncellenir(client, admin, project):
    a, b = _case(client, admin, project["id"]), _case(client, admin, project["id"])
    results = [{"case_id": a["id"], "status": "Passed"}, {"case_id": b["id"], "status": "Failed", "actual_result": "500"}]
    run = {"name": "R1", "project_id": project["id"], "status": "Aktif", "results": json.dumps(results)}
    r = client.post("/test-runs/", json=run, headers=admin)
    assert r.status_code == 201, r.text
    # koşum sürerken case'ler değişmez
    assert client.get(f"/test-cases/{a['id']}", headers=admin).json()["status"] == "Test Edilmedi"

    client.put(f"/test-runs/{r.json()['id']}", json={**run, "status": "Tamamlandı"}, headers=admin)
    assert client.get(f"/test-cases/{a['id']}", headers=admin).json()["status"] == "Başarılı"
    assert client.get(f"/test-cases/{b['id']}", headers=admin).json()["status"] == "Başarısız"


def test_kosum_gecmisi(client, admin, project, make_user, login):
    tc = _case(client, admin, project["id"])
    other = _case(client, admin, project["id"], title="Diğer")
    for name, status in (("Eski", "Passed"), ("Yeni", "Failed")):
        res = [{"case_id": tc["id"], "status": status, "actual_result": "hata" if status == "Failed" else None},
               {"case_id": other["id"], "status": "Passed"}]
        client.post("/test-runs/", json={"name": name, "project_id": project["id"], "status": "Tamamlandı",
                                         "results": json.dumps(res)}, headers=admin)
    client.post("/test-runs/", json={"name": "Alakasız", "project_id": project["id"],
                                     "results": json.dumps([{"case_id": other["id"], "status": "Passed"}])}, headers=admin)

    r = client.get(f"/test-cases/{tc['id']}/history", headers=admin)
    assert r.status_code == 200, r.text
    h = r.json()
    assert [x["run_name"] for x in h["runs"]] == ["Yeni", "Eski"]
    assert h["runs"][0]["result"] == "Failed" and h["runs"][0]["note"] == "hata"
    assert len(h["defects"]) == 1 and h["defects"][0]["status"] == "Open"

    assert client.get("/test-cases/999999/history", headers=admin).status_code == 404
    make_user("izleyen", role="viewer")
    assert client.get(f"/test-cases/{tc['id']}/history", headers=login("izleyen")).status_code == 200


def test_gecmis_bekleyen_ve_atlanan_sonuclari_esler(client, admin, project):
    tc = _case(client, admin, project["id"])
    for name, st in (("A", "Pending"), ("B", "Skipped")):
        client.post("/test-runs/", json={"name": name, "project_id": project["id"],
                                         "results": json.dumps([{"test_case_id": tc["id"], "status": st}])}, headers=admin)
    h = client.get(f"/test-cases/{tc['id']}/history", headers=admin).json()
    assert [x["result"] for x in h["runs"]] == ["Skipped", "Untested"]


def test_mobil_kosum_dogrulama_ve_bitis(client, admin, project, make_user, login):
    body = {"test_case_id": 999999, "device_id": "emu-1", "platform": "android", "app_path": "/a.apk"}
    assert client.post("/api/mobile/run", json=body, headers=admin).status_code == 404

    tc = _case(client, admin, project["id"])
    assert client.post("/api/mobile/run", json={**body, "test_case_id": tc["id"], "platform": "web"},
                       headers=admin).status_code == 422
    make_user("izleyen2", role="viewer")
    assert client.post("/api/mobile/run", json={**body, "test_case_id": tc["id"]},
                       headers=login("izleyen2")).status_code == 403

    r = client.post("/api/mobile/run", json={**body, "test_case_id": tc["id"]}, headers=admin)
    assert r.status_code == 201, r.text
    run_id = r.json()["run_id"]
    # Appium sunucusu yok: koşu takılmadan "failed" ile biter ve akış [DONE] ile kapanır
    with client.stream("GET", f"/api/mobile/run/{run_id}/logs/stream", headers=admin) as s:
        events = [json.loads(line[6:]) for line in s.iter_lines() if line.startswith("data: ")]
    assert events[-1]["msg"] == "[DONE]" and events[-1]["status"] == "failed"
    assert any(e["level"] == "error" for e in events[:-1])
