"""Kullanıcı durumu, admin koruması, değişken kapsamı ve ortam çözümlemesi."""


def test_devre_disi_kullanici_giris_yapamaz_ve_oturumu_duser(client, admin, make_user, login):
    make_user("ayse", role="tester")
    h = login("ayse")
    uid = next(u["id"] for u in client.get("/users/", headers=admin).json() if u["username"] == "ayse")
    me = client.get("/auth/me", headers=h).json()
    assert me["last_login_at"] and me["is_active"] is True

    assert client.put(f"/users/{uid}", json={"is_active": False}, headers=admin).status_code == 200
    assert client.get("/auth/me", headers=h).status_code == 401          # açık oturum düştü
    r = client.post("/auth/login", json={"identifier": "ayse", "password": "Passw0rd1"})
    assert r.status_code == 403 and "devre dışı" in r.json()["detail"]

    client.put(f"/users/{uid}", json={"is_active": True}, headers=admin)
    assert client.post("/auth/login", json={"identifier": "ayse", "password": "Passw0rd1"}).status_code == 200


def test_kendini_devre_disi_birakamaz_ve_yonetici_admine_dokunamaz(client, admin, make_user, login):
    users = {u["username"]: u for u in client.get("/users/", headers=admin).json()}
    assert client.put(f"/users/{users['boss']['id']}", json={"is_active": False}, headers=admin).status_code == 400

    # users.manage izni olan, admin olmayan bir rol
    rid = client.post("/roles/", json={"name": "ik", "display_name": "İK"}, headers=admin).json()["id"]
    perms = {p["key"]: p["id"] for p in client.get("/permissions/", headers=admin).json()}
    client.put(f"/roles/{rid}/permissions", json={"permission_ids": [perms["users.view"], perms["users.manage"]]}, headers=admin)
    make_user("ik1", role="ik")
    ik = login("ik1")
    boss = users["boss"]["id"]
    assert client.patch(f"/users/{boss}/password", json={"password": "Ele9eciri"}, headers=ik).status_code == 403
    assert client.put(f"/users/{boss}", json={"full_name": "x"}, headers=ik).status_code == 403
    assert client.delete(f"/users/{boss}", headers=ik).status_code == 403
    # admin olmayan kullanıcıya dokunabilir
    make_user("can", role="viewer")
    can = next(u["id"] for u in client.get("/users/", headers=ik).json() if u["username"] == "can")
    assert client.patch(f"/users/{can}/password", json={"password": "Yeni1234"}, headers=ik).status_code == 200


def test_degisken_dogrulama_ve_kapsam(client, admin, project):
    other = client.post("/projects/", json={"name": "Diğer"}, headers=admin).json()
    env = client.post("/environments/", json={"name": "Staging", "project_id": project["id"], "url": "https://st.ornek.com/"}, headers=admin).json()
    assert env["url"] == "https://st.ornek.com"
    assert client.post("/environments/", json={"name": "X", "project_id": project["id"], "url": "ftp://x"}, headers=admin).status_code == 422

    assert client.post("/variables/", json={"key": "1ABC", "value": "x"}, headers=admin).status_code == 422
    r = client.post("/variables/", json={"key": "api token", "value": "x", "env_id": env["id"]}, headers=admin)
    assert r.status_code == 201 and r.json()["key"] == "API_TOKEN" and r.json()["project_id"] == project["id"]
    # başka projenin ortamı
    assert client.post("/variables/", json={"key": "A", "value": "x", "env_id": env["id"], "project_id": other["id"]},
                       headers=admin).status_code == 400
    # global kapsamda aynı anahtar iki kez olamaz (NULL benzersizlik açığı)
    assert client.post("/variables/", json={"key": "LANG", "value": "tr"}, headers=admin).status_code == 201
    assert client.post("/variables/", json={"key": "LANG", "value": "en"}, headers=admin).status_code == 400


def test_ortam_cozumlemesi(client, admin, project, make_user, login):
    env = client.post("/environments/", json={"name": "Staging", "project_id": project["id"], "url": "https://st.ornek.com"}, headers=admin).json()
    for body in ({"key": "TIMEOUT", "value": "10"},
                 {"key": "TIMEOUT", "value": "20", "project_id": project["id"]},
                 {"key": "TIMEOUT", "value": "30", "env_id": env["id"]},
                 {"key": "LANG", "value": "tr"},
                 {"key": "PASS", "value": "Cok$Gizli", "env_id": env["id"], "is_secret": True}):
        assert client.post("/variables/", json=body, headers=admin).status_code == 201
    make_user("izle")
    r = client.get(f"/environments/{env['id']}/resolved", headers=login("izle"))
    assert r.status_code == 200
    got = {v["key"]: (v["value"], v["source"]) for v in r.json()}
    assert got["BASE_URL"] == ("https://st.ornek.com", "env")
    assert got["TIMEOUT"] == ("30", "env") and got["LANG"] == ("tr", "global")
    assert "Gizli" not in got["PASS"][0]
