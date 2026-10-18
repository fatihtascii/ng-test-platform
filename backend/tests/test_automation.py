"""WebSocket üzerinden otomasyon koşumu (gerçek pytest alt süreci çalıştırır)."""
import glob
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
