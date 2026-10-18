"""Koşum kapsamı, plan ↔ koşum senkronu ve plan kalemi toplu işlemleri."""
import json


def _case(client, h, pid, title="C"):
    r = client.post("/test-cases/", json={"title": title, "project_id": pid}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _results(run):
    return json.loads(run["results"])


def test_sonucsuz_kosum_kapsami_sabitlenir(client, admin, project):
    a, b = _case(client, admin, project["id"]), _case(client, admin, project["id"])
    run = client.post("/test-runs/", json={"name": "Tümü", "project_id": project["id"]}, headers=admin).json()
    assert [(r["test_case_id"], r["status"]) for r in _results(run)] == [(a, "Pending"), (b, "Pending")]
    # sonradan eklenen case eski koşumu değiştirmez
    _case(client, admin, project["id"])
    again = client.get(f"/test-runs/{run['id']}", headers=admin).json()
    assert len(_results(again)) == 2

    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    client.post(f"/test-plans/{plan['id']}/bulk-add", json={"test_case_ids": [b]}, headers=admin)
    prun = client.post("/test-runs/", json={"name": "Plan", "project_id": project["id"], "test_plan_id": plan["id"]},
                       headers=admin).json()
    assert [r["test_case_id"] for r in _results(prun)] == [b]
    # plan filtresi
    listed = client.get(f"/test-runs/?test_plan_id={plan['id']}", headers=admin).json()
    assert [r["id"] for r in listed] == [prun["id"]]


def test_plana_bagli_kosum_bitince_plan_kalemleri_guncellenir(client, admin, project):
    a, b = _case(client, admin, project["id"]), _case(client, admin, project["id"])
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    client.post(f"/test-plans/{plan['id']}/bulk-add", json={"test_case_ids": [a, b]}, headers=admin)
    run = client.post("/test-runs/", json={"name": "R", "project_id": project["id"], "test_plan_id": plan["id"]},
                      headers=admin).json()
    res = [{"test_case_id": a, "status": "Passed", "actual_result": ""},
           {"test_case_id": b, "status": "Failed", "actual_result": "Buton pasif"}]
    body = {"name": "R", "project_id": project["id"], "test_plan_id": plan["id"], "results": json.dumps(res)}
    client.put(f"/test-runs/{run['id']}", json={**body, "status": "Aktif"}, headers=admin)
    items = {i["test_case_id"]: i for i in client.get(f"/test-plans/{plan['id']}", headers=admin).json()["items"]}
    assert items[a]["run_status"] == "Bekliyor"          # koşum sürerken plan değişmez

    client.put(f"/test-runs/{run['id']}", json={**body, "status": "Tamamlandı"}, headers=admin)
    items = {i["test_case_id"]: i for i in client.get(f"/test-plans/{plan['id']}", headers=admin).json()["items"]}
    assert items[a]["run_status"] == "Başarılı"
    assert items[b]["run_status"] == "Başarısız" and items[b]["note"] == "Buton pasif"


def test_plan_kalemi_toplu_statu_ve_kaldirma(client, admin, project, make_user, login):
    ids = [_case(client, admin, project["id"], f"C{i}") for i in range(3)]
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    plan = client.post(f"/test-plans/{plan['id']}/bulk-add", json={"test_case_ids": ids}, headers=admin)
    plan = client.get("/test-plans/", headers=admin).json()[0]
    item_ids = [i["id"] for i in plan["items"]]

    r = client.post(f"/test-plans/{plan['id']}/items/bulk-status",
                    json={"item_ids": item_ids[:2], "run_status": "Başarısız"}, headers=admin)
    assert r.status_code == 200, r.text
    assert [i["run_status"] for i in r.json()["items"]] == ["Başarısız", "Başarısız", "Bekliyor"]
    # case'in son sonucu da güncellenir
    assert client.get(f"/test-cases/{ids[0]}", headers=admin).json()["status"] == "Başarısız"
    assert client.post(f"/test-plans/{plan['id']}/items/bulk-status",
                       json={"item_ids": item_ids, "run_status": "Uydurma"}, headers=admin).status_code == 422

    make_user("izci", role="viewer")
    assert client.post(f"/test-plans/{plan['id']}/items/bulk-remove", json={"item_ids": item_ids},
                       headers=login("izci")).status_code == 403
    r = client.post(f"/test-plans/{plan['id']}/items/bulk-remove", json={"item_ids": item_ids[1:]}, headers=admin)
    assert [i["test_case_id"] for i in r.json()["items"]] == [ids[0]]


def test_tekil_kalem_guncellemesi_case_statusunu_gunceller(client, admin, project):
    a = _case(client, admin, project["id"])
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    client.post(f"/test-plans/{plan['id']}/bulk-add", json={"test_case_ids": [a]}, headers=admin)
    item = client.get(f"/test-plans/{plan['id']}", headers=admin).json()["items"][0]
    r = client.patch(f"/test-plans/{plan['id']}/items/{item['id']}", json={"run_status": "Başarılı"}, headers=admin)
    assert r.status_code == 200 and r.json()["test_case_execution_type"] == "Manual"
    assert client.get(f"/test-cases/{a}", headers=admin).json()["status"] == "Başarılı"
