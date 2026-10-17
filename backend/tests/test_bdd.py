"""Gherkin → pytest-bdd kod üretici."""
import ast

from app.modules.test_cases.service import generate_bdd_code


def _split(code):
    feature, steps = code.split("# === STEP DEFINITIONS ===")
    return feature, steps


def test_ingilizce_senaryo():
    code = generate_bdd_code("Feature: Login\nScenario: Ok\nGiven a page\nWhen I log in\nAnd I wait\nThen I see it\nBut no error")["code"]
    feature, steps = _split(code)
    ast.parse(steps)
    assert "Feature: Login" in feature and steps.count("@given") == 1 and steps.count("@when") == 2 and steps.count("@then") == 2


def test_turkce_senaryo_ve_karakterler():
    g = 'Özellik: Giriş\nSenaryo: Şifre "yanlış"\nDiyelim ki kullanıcı ÜYE\nEğer "abc" girer\nVe "abc" girer\nO zaman hata görünür'
    feature, steps = _split(generate_bdd_code(g)["code"])
    ast.parse(steps)                              # tırnaklı adımlar geçerli Python üretir
    assert "# language: tr" in feature and "Özellik: Giriş" in feature
    assert "def given_kullanici_uye()" in steps    # ü→u, ı→i (eski tablo ü→s yapıyordu)
    assert steps.count('@when(\'"abc" girer\')') == 1  # aynı adım bir kez tanımlanır
    assert "test_sifre_yanlis" in steps


def test_endpoint(client, admin):
    r = client.post("/test-cases/generate-bdd-code", json={"gherkin": "Feature: X\nScenario: Y\nGiven z"}, headers=admin)
    assert r.status_code == 200 and "@given('z')" in r.json()["code"]
