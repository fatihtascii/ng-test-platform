"""Test planı doğrulamaları."""


def _case(client, h, pid, title="TC"):
    r = client.post("/test-cases/", json={"title": title, "project_id": pid}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_tarih_ve_statu_dogrulama(client, admin, project):
    base = {"title": "Plan", "project_id": project["id"]}
    assert client.post("/test-plans/", json={**base, "start_date": "2026-10-10", "end_date": "2026-10-01"}, headers=admin).status_code == 422
    assert client.post("/test-plans/", json={**base, "status": "Yok"}, headers=admin).status_code == 422
    r = client.post("/test-plans/", json={**base, "start_date": "", "end_date": ""}, headers=admin)
    assert r.status_code == 201 and r.json()["start_date"] is None


def test_toplu_ekleme(client, admin, project):
    other = client.post("/projects/", json={"name": "Diğer"}, headers=admin).json()
    a, b = _case(client, admin, project["id"], "A"), _case(client, admin, project["id"], "B")
    foreign = _case(client, admin, other["id"], "X")
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    url = f"/test-plans/{plan['id']}/bulk-add"
    # tekrarlı ID artık 500 vermiyor
    r = client.post(url, json={"test_case_ids": [a, a, b]}, headers=admin)
    assert r.status_code == 200 and r.json()["added"] == 2
    assert client.post(url, json={"test_case_ids": [a]}, headers=admin).json()["skipped"] == 1
    assert client.post(url, json={"test_case_ids": [999999]}, headers=admin).status_code == 404
    assert client.post(url, json={"test_case_ids": [foreign]}, headers=admin).status_code == 400
    assert client.post(f"/test-plans/{plan['id']}/items", json={"test_case_id": foreign}, headers=admin).status_code == 400


def test_item_statusu_dogrulama(client, admin, project):
    a = _case(client, admin, project["id"])
    plan = client.post("/test-plans/", json={"title": "P", "project_id": project["id"]}, headers=admin).json()
    plan = client.post(f"/test-plans/{plan['id']}/items", json={"test_case_id": a}, headers=admin).json()
    item = plan["items"][0]["id"]
    assert client.patch(f"/test-plans/{plan['id']}/items/{item}", json={"run_status": "Bozuk"}, headers=admin).status_code == 422
    assert client.patch(f"/test-plans/{plan['id']}/items/{item}", json={"run_status": "Başarısız", "note": "x"}, headers=admin).status_code == 200
