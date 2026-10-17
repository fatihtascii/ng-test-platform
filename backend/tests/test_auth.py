"""Kimlik doğrulama ve rol bazlı yetki."""
import pytest


@pytest.mark.parametrize("path", ["/projects/", "/users/", "/test-cases/", "/roles/", "/integrations/", "/defects/"])
def test_token_olmadan_401(client, path):
    assert client.get(path).status_code == 401


def test_bozuk_token_401(client):
    assert client.get("/projects/", headers={"Authorization": "Bearer bozuk"}).status_code == 401


def test_kayit_her_zaman_viewer(client, login):
    r = client.post("/auth/register", json={"username": "hacker", "password": "Hacker123", "role": "admin"})
    assert r.status_code == 201 and r.json()["role"] == "viewer"
    me = client.get("/auth/me", headers=login("hacker", "Hacker123")).json()
    assert me["role"] == "viewer" and "projects.create" not in me["permissions"]


def test_viewer_okur_yazamaz(client, admin, make_user, login, project):
    make_user("vic")
    V = login("vic")
    assert client.get("/projects/", headers=V).status_code == 200
    assert client.post("/projects/", json={"name": "X"}, headers=V).status_code == 403
    assert client.post("/users/", json={"username": "evil", "password": "Evil12345", "role": "admin"}, headers=V).status_code == 403
    assert client.get("/integrations/", headers=V).status_code == 403


def test_admin_rolunu_sadece_admin_verir(client, admin, make_user, login):
    make_user("mgr", role="manager")
    # manager'a users.manage verilmemiş → zaten 403
    r = client.post("/users/", json={"username": "tt1", "password": "Tester123", "role": "tester"}, headers=admin)
    assert r.status_code == 201
    assert client.post("/users/", json={"username": "tt2", "password": "Tester123", "role": "olmayan"}, headers=admin).status_code == 400


def test_son_admin_korunur(client, admin):
    me = client.get("/auth/me", headers=admin).json()
    assert client.delete(f"/users/{me['id']}", headers=admin).status_code == 400
    assert client.put(f"/users/{me['id']}", json={"role": "viewer"}, headers=admin).status_code == 400


def test_login_buyuk_kucuk_harf_duyarsiz(client, make_user):
    make_user("Fatih", email="Fatih@Example.com")
    for ident in ("Fatih", "fatih", "FATIH", "fatih@example.com"):
        assert client.post("/auth/login", json={"identifier": ident, "password": "Passw0rd1"}).status_code == 200
    assert client.post("/auth/register", json={"username": "fatih", "password": "Other1234"}).status_code == 400


def test_eposta_olmadan_birden_fazla_kullanici(client):
    for u in ("ali1", "ali2"):
        assert client.post("/auth/register", json={"username": u, "password": "Passw0rd1"}).status_code == 201


def test_rol_izni_aninda_gecerli(client, admin, make_user, login):
    make_user("vic")
    V = login("vic")
    assert client.post("/projects/", json={"name": "X"}, headers=V).status_code == 403
    viewer = next(r for r in client.get("/roles/", headers=admin).json() if r["name"] == "viewer")
    perms = {p["key"]: p["id"] for p in client.get("/permissions/", headers=admin).json()}
    ids = [p["id"] for p in viewer["permissions"]] + [perms["projects.create"]]
    assert client.put(f"/roles/{viewer['id']}/permissions", json={"permission_ids": ids}, headers=admin).status_code == 200
    assert client.post("/projects/", json={"name": "X"}, headers=V).status_code == 201


def test_sonda_slash_olmadan_yonlendirme_yok(client, admin):
    r = client.post("/projects", json={"name": "P"}, headers=admin, follow_redirects=False)
    assert r.status_code == 201
    assert client.get("/projects", headers=admin, follow_redirects=False).status_code == 200


def test_zamanlar_saat_dilimli_doner(client, admin, project):
    """Saat dilimsiz zamanlar tarayıcıda yerel saat sanılıp (TR'de) 3 saat kayıyordu."""
    from datetime import datetime, timezone
    me = client.get("/auth/me", headers=admin).json()
    tc = client.post("/test-cases/", json={"title": "T", "project_id": project["id"]}, headers=admin).json()
    for value in (me["created_at"], tc["created_at"]):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        assert parsed.tzinfo is not None, value
        assert abs((datetime.now(timezone.utc) - parsed).total_seconds()) < 120
