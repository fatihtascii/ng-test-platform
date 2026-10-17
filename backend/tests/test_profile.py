"""Profilim: kendi bilgilerini ve şifresini değiştirme."""


def test_profil_guncelleme(client, make_user, login):
    make_user("vic")
    make_user("boss", role="admin", email="boss@x.co")
    V = login("vic")
    r = client.patch("/auth/me", json={"full_name": "Vic Viewer", "email": "vic@x.co"}, headers=V)
    assert r.status_code == 200 and r.json()["full_name"] == "Vic Viewer"
    assert client.patch("/auth/me", json={"email": "BOSS@x.co"}, headers=V).status_code == 400
    assert client.patch("/auth/me", json={"full_name": "  "}, headers=V).status_code == 400
    assert client.patch("/auth/me", json={"role": "admin"}, headers=V).json()["role"] == "viewer"


def test_sifre_degistirme(client, make_user, login, admin):
    make_user("vic")
    V = login("vic")
    url = "/auth/me/password"
    assert client.post(url, json={"current_password": "yanlis", "new_password": "Yeni12345"}, headers=V).status_code == 400
    assert client.post(url, json={"current_password": "Passw0rd1", "new_password": "zayif"}, headers=V).status_code == 400
    assert client.post(url, json={"current_password": "Passw0rd1", "new_password": "Passw0rd1"}, headers=V).status_code == 400
    assert client.post(url, json={"current_password": "Passw0rd1", "new_password": "Yeni12345"}, headers=V).status_code == 200
    assert client.post("/auth/login", json={"identifier": "vic", "password": "Passw0rd1"}).status_code == 401
    login("vic", "Yeni12345")
    # admin de kendi şifresini mevcut şifre olmadan değiştiremez
    assert client.post(url, json={"current_password": "yanlis", "new_password": "Admin5678"}, headers=admin).status_code == 400


def test_baskasinin_sifresi(client, admin, make_user, login):
    make_user("vic"); make_user("tess", role="tester")
    V = login("vic")
    tess_id = next(u["id"] for u in client.get("/users/", headers=admin).json() if u["username"] == "tess")
    assert client.patch(f"/users/{tess_id}/password", json={"password": "Reset1234"}, headers=V).status_code == 403
    assert client.patch(f"/users/{tess_id}/password", json={"password": "Reset1234"}, headers=admin).status_code == 200
    login("tess", "Reset1234")
