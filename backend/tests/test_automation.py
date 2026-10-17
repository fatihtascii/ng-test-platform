"""WebSocket üzerinden otomasyon koşumu (gerçek pytest alt süreci çalıştırır)."""
import glob
import os
import tempfile

import pytest

pytest.importorskip("pytest_playwright", reason="koşum motoru --browser için pytest-playwright gerektirir")


def _run(client, token, case_ids):
    msgs = []
    with client.websocket_connect(f"/ws/run-test?token={token}") as ws:
        ws.send_json({"cases": case_ids, "browser": "Chrome", "headless": True})
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
