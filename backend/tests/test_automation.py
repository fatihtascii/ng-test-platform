"""WebSocket üzerinden otomasyon koşumu (gerçek pytest alt süreci çalıştırır)."""
import glob
import json
import os
import tempfile

import pytest

pytest.importorskip("pytest_playwright", reason="koşum motoru --browser için pytest-playwright gerektirir")


def _run(client, token, case_ids, **extra):
    msgs = []
    with client.websocket_connect(f"/ws/run-test?token={token}") as ws:
        ws.send_json({"cases": case_ids, "browser": "Chrome", "headless": True, **extra})
        while True:
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] == "done":
                return msgs


def test_tokensiz_ve_yetkisiz_baglanti_kapanir(client, make_user, login):
    from starlette.websockets import WebSocketDisconnect
    make_user("vic")
    vic_token = login("vic")["Authorization"][7:]
    for query, code in (("", 4401), (f"?token={vic_token}", 4403)):
        with client.websocket_connect("/ws/run-test" + query) as ws:
            assert ws.receive_json()["type"] == "error"
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == code


def test_kosum_kaydi_defect_ve_temizlik(client, admin, project):
    token = admin["Authorization"][7:]
    mk = lambda t, s: client.post("/test-cases/", json={"title": t, "project_id": project["id"], "execution_type": "Automated", "automation_script": s}, headers=admin).json()["id"]
    ok = mk("Geçen", "def test_ok():\n    assert True\n")
    bad = mk("Patlayan", "def test_bad():\n    assert 1 == 2\n")
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "ngtest_run_*")))

    msgs = _run(client, token, [ok, bad])
    text = "\n".join(m["message"] for m in msgs)
    assert "PASSED" in text and "FAILED" in text
    assert set(glob.glob(os.path.join(tempfile.gettempdir(), "ngtest_run_*"))) == before  # temp klasör silindi

    runs = client.get("/test-runs/", headers=admin).json()
    assert len(runs) == 1 and runs[0]["status"] == "Başarısız" and not runs[0]["is_defect"]
    defects = client.get("/defects/", headers=admin).json()
    assert len(defects) == 1 and [d["case_id"] for d in defects[0]["failed_details"]] == [bad]
    statuses = {c["id"]: c["status"] for c in client.get("/test-cases/", headers=admin).json()}
    assert statuses == {ok: "Başarılı", bad: "Başarısız"}

    # hepsi geçen koşum → koşum kaydı var, yeni defect yok
    _run(client, token, [ok])
    assert len(client.get("/test-runs/", headers=admin).json()) == 2
    assert len(client.get("/defects/", headers=admin).json()) == 1


def test_ortam_degiskenleri_teste_aktarilir_ve_sirlar_maskelenir(client, admin, project):
    token = admin["Authorization"][7:]
    env = client.post("/environments/", json={"name": "Staging", "project_id": project["id"], "url": "https://st.ornek.com"},
                      headers=admin).json()
    client.post("/variables/", json={"key": "API_USER", "value": "qa-bot", "project_id": project["id"]}, headers=admin)
    client.post("/variables/", json={"key": "API_PASS", "value": "S3cret-Value", "env_id": env["id"], "is_secret": True}, headers=admin)
    script = (
        "import os\n"
        "def test_env(base_url):\n"
        "    print('USER=' + os.environ['API_USER'] + ' PASS=' + os.environ['API_PASS'] + ' ENV=' + os.environ['NG_ENVIRONMENT'])\n"
        "    assert base_url == 'https://st.ornek.com' and os.environ['BASE_URL'] == base_url\n"
    )
    cid = client.post("/test-cases/", json={"title": "Ortam", "project_id": project["id"], "execution_type": "Automated",
                                             "automation_script": script}, headers=admin).json()["id"]
    msgs = _run(client, token, [cid], environment_id=env["id"])
    text = "\n".join(m["message"] for m in msgs)
    assert "Ortam: Staging" in text and "PASSED" in text, text[-2000:]
    assert "USER=qa-bot" in text and "S3cret-Value" not in text and "PASS=••••••••" in text
    run = client.get("/test-runs/", headers=admin).json()[0]
    assert "Ortam: Staging" in run["description"]


# ── Yeni motor: tek kayıt, case bazında sonuç, durdurma ───────────────────────

def _mk(client, admin, project, title, script, **kw):
    return client.post("/test-cases/", json={"title": title, "project_id": project["id"], "execution_type": "Automated",
                                             "automation_script": script, **kw}, headers=admin).json()["id"]


def test_sonuclar_case_bazinda_ve_tek_kosum(client, admin, project):
    token = admin["Authorization"][7:]
    ok = _mk(client, admin, project, "Geçen", "def test_a():\n    assert True\n\ndef test_b():\n    assert True\n")
    bad = _mk(client, admin, project, "Kalan", "def test_a():\n    assert True\n\ndef test_b():\n    assert 1 == 2, 'toplam yanlış'\n")
    broken = _mk(client, admin, project, "Sözdizimi", "def test_x(:\n    pass\n")
    skip = _mk(client, admin, project, "Atlanan", "import pytest\n\n@pytest.mark.skip(reason='hazır değil')\ndef test_s():\n    pass\n")
    noscript = client.post("/test-cases/", json={"title": "Script yok", "project_id": project["id"]}, headers=admin).json()["id"]

    msgs = _run(client, token, [bad, ok, noscript, broken, skip])
    plan = next(m for m in msgs if m["type"] == "plan")
    assert {c["case_id"]: c["status"] for c in plan["cases"]} == {bad: "queued", ok: "queued", broken: "queued", skip: "queued", noscript: "skipped"}
    live = [(m["case_id"], m["status"]) for m in msgs if m["type"] == "case"]
    assert (ok, "running") in live and (bad, "failed") in live
    summary = next(m for m in msgs if m["type"] == "summary")
    assert summary["counts"] == {"passed": 1, "failed": 2, "skipped": 2} and summary["run_id"] and summary["defect"]
    # sonuç mesajları "başarısız test" sayılmasın diye ayrı tipte
    assert not any(m["type"] == "case" and m["status"] == "failed" and m["case_id"] == ok for m in msgs)

    runs = client.get("/test-runs/", headers=admin).json()
    assert len(runs) == 1, "otomasyon koşumu tek kez kaydedilmeli"
    run = runs[0]
    assert run["source"] == "automation" and run["created_by"] and run["meta"]["browser"] == "Chrome" and run["meta"]["skipped"] == [noscript]
    res = {r["case_id"]: r for r in json.loads(run["results"])}
    assert res[ok]["status"] == "Passed" and "duration" in res[ok]
    assert res[bad]["status"] == "Failed" and "toplam yanlış" in res[bad]["actual_result"]
    assert res[broken]["status"] == "Failed" and res[broken]["actual_result"]
    assert res[skip]["status"] == "Skipped" and res[noscript]["status"] == "Skipped" and "script" in res[noscript]["actual_result"]
    statuses = {c["id"]: c["status"] for c in client.get("/test-cases/", headers=admin).json()}
    assert statuses[ok] == "Başarılı" and statuses[bad] == "Başarısız" and statuses[noscript] == "Test Edilmedi"
    assert len(client.get("/test-runs/", params={"source": "automation"}, headers=admin).json()) == 1
    assert client.get("/test-runs/", params={"source": "manual"}, headers=admin).json() == []


def test_durdurma_sureci_sonlandirir_ve_kaydetmez(client, admin, project):
    token = admin["Authorization"][7:]
    slow = _mk(client, admin, project, "Yavaş", "import time\n\ndef test_slow():\n    print('basladi', flush=True)\n    time.sleep(60)\n")
    before = set(glob.glob(os.path.join(tempfile.gettempdir(), "ngtest_run_*")))
    with client.websocket_connect(f"/ws/run-test?token={token}") as ws:
        ws.send_json({"cases": [slow]})
        while True:
            m = ws.receive_json()
            if m["type"] == "case" and m["status"] == "running":
                break
        ws.send_json({"type": "stop"})
        while m["type"] not in ("stopped", "done"):
            m = ws.receive_json()
    assert m["type"] == "stopped"
    assert client.get("/test-runs/", headers=admin).json() == []
    assert set(glob.glob(os.path.join(tempfile.gettempdir(), "ngtest_run_*"))) == before


def test_proje_ortam_ve_esz_kosum_kontrolu(client, admin, project, monkeypatch):
    token = admin["Authorization"][7:]
    a = _mk(client, admin, project, "A", "def test_a():\n    pass\n")
    other = client.post("/projects/", json={"name": "Diğer"}, headers=admin).json()
    b = client.post("/test-cases/", json={"title": "B", "project_id": other["id"], "execution_type": "Automated",
                                         "automation_script": "def test_b():\n    pass\n"}, headers=admin).json()["id"]
    env = client.post("/environments/", json={"name": "Prod", "project_id": other["id"], "url": "https://x.ornek.com"}, headers=admin).json()

    def first_error(payload):
        with client.websocket_connect(f"/ws/run-test?token={token}") as ws:
            ws.send_json(payload)
            while True:
                m = ws.receive_json()
                if m["type"] in ("error", "done"):
                    return m
    assert "tek bir projeye" in first_error({"cases": [a, b]})["message"]
    assert "projeye ait değil" in first_error({"cases": [a], "environment_id": env["id"]})["message"]
    assert "bulunamadı" in first_error({"cases": [999999]})["message"]
    from app.modules.automation import runner
    monkeypatch.setattr(runner, "MAX_PARALLEL", 0)
    assert "koşumu sürüyor" in first_error({"cases": [a]})["message"]
    assert client.get("/test-runs/", headers=admin).json() == []


def test_canli_izleyici_ve_junit_cozumleyici(tmp_path):
    from app.modules.automation.runner import LiveTracker, parse_junit
    t = LiveTracker([3, 7])
    assert t.feed("test_case_3_ab12cd34.py::test_login PASSED   [ 50%]") == [(3, "running"), (3, "passed")]
    assert t.feed("test_case_7_ab12cd34.py::test_a USER=qa") == [(7, "running")]
    assert t.feed("PASSED") == [(7, "passed")]
    assert t.feed("test_case_7_ab12cd34.py::test_b FAILED [100%]") == [(7, "failed")]
    assert t.feed("test_case_7_ab12cd34.py::test_c PASSED") == []      # kalan case geçti'ye dönmez
    assert t.finished == 2
    xml = tmp_path / "j.xml"
    xml.write_text(
        '<testsuites><testsuite>'
        '<testcase classname="test_case_3_ab12cd34" name="test_a" time="0.5"/>'
        '<testcase classname="test_case_3_ab12cd34" name="test_b" time="0.25"><failure message="assert 1 == 2">kaba iz S3cret</failure></testcase>'
        '<testcase classname="test_case_7_ab12cd34" name="test_s" time="0"><skipped message="hazır değil"/></testcase>'
        '</testsuite></testsuites>', encoding="utf-8")
    r = parse_junit(str(xml), redact=lambda s: s.replace("S3cret", "•••"))
    assert r[3]["status"] == "failed" and r[3]["duration"] == 0.75 and "assert 1 == 2" in r[3]["message"] and "S3cret" not in r[3]["message"]
    assert r[7]["status"] == "skipped" and r[7]["message"] == "hazır değil"
    assert parse_junit(str(tmp_path / "yok.xml")) == {}
