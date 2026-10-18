"""Otomasyon deposu: bağla, senkronize et, içe aktar, koştur (yerel git deposu + gerçek pytest)."""
import json
import os
import subprocess
import textwrap

import pytest

pytest.importorskip("pytest_playwright")

FILES = {
    "requirements.txt": "pytest\n",
    "pytest.ini": textwrap.dedent("""\
        [pytest]
        testpaths = tests
        pythonpath = .
        addopts = -ra --strict-markers
        markers =
            smoke: hızlı kontroller
            data_producing: kalıcı kayıt bırakır
            configure: Configure bölümü
        """),
    "config.py": textwrap.dedent("""\
        import os
        BASE_URL = os.environ.get("BASE_URL")
        if not BASE_URL:
            raise RuntimeError("BASE_URL tanımlı değil")
        """),
    "pages/__init__.py": "",
    "pages/flow_page.py": "class FlowPage:\n    def name(self, n):\n        return f'flow-{n}'\n",
    "tests/__init__.py": "",
    "tests/conftest.py": textwrap.dedent("""\
        from pathlib import Path
        import pytest
        import config  # noqa: F401  (ortam değişkeni yoksa toplama başarısız olur)

        def pytest_collection_modifyitems(config, items):
            for item in items:
                if Path(item.fspath).parent.name == "configure":
                    item.add_marker(pytest.mark.configure)
        """),
    "tests/configure/__init__.py": "",
    "tests/configure/test_flows.py": textwrap.dedent("""\
        import pytest
        from pages.flow_page import FlowPage

        class TestFlows:
            def test_create_flow_modal(self):
                \"\"\"Create Flow penceresi açılır\"\"\"
                assert FlowPage().name(1) == "flow-1"

            @pytest.mark.data_producing
            @pytest.mark.parametrize("n", [1, 2, 3])
            def test_flow_names(self, n):
                assert n != 2, "ikinci flow adı hatalı"

            @pytest.mark.xfail(reason="EF-247 bilinen hata", strict=False)
            def test_known_bug(self):
                assert False
        """),
    "tests/smoke/__init__.py": "",
    "tests/smoke/test_login.py": textwrap.dedent("""\
        import os
        import pytest

        @pytest.mark.smoke
        def test_login_page_opens():
            print("PASS=" + os.environ.get("ADMIN_PASSWORD", ""))
            assert os.environ["BASE_URL"] == "https://dev.ornek.com"
        """),
}


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                   env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "easy-tests"
    for path, content in FILES.items():
        f = root / path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content, encoding="utf-8")
    _git(root, "init", "-q", "-b", "main")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "ilk testler")
    return root


def _env(client, admin, project):
    env = client.post("/environments/", json={"name": "Dev", "project_id": project["id"], "url": "https://dev.ornek.com"}, headers=admin).json()
    client.post("/variables/", json={"key": "BASE_URL", "value": "https://dev.ornek.com", "env_id": env["id"]}, headers=admin)
    client.post("/variables/", json={"key": "ADMIN_PASSWORD", "value": "Gizli-Sifre-123", "env_id": env["id"], "is_secret": True}, headers=admin)
    return env


def _suite(client, admin, project, repo, env=None, **extra):
    body = {"name": "easycontact admin", "project_id": project["id"], "repo_url": str(repo), "branch": "main",
            "token": "ghp_gizli_token_1234", "environment_id": env["id"] if env else None,
            "profiles": [{"name": "Smoke", "marker": "smoke"}, {"name": "Güvenli", "marker": "not data_producing"}], **extra}
    r = client.post("/suites/", json=body, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _ws(client, token, payload):
    msgs = []
    with client.websocket_connect(f"/ws/run-test?token={token}") as ws:
        ws.send_json(payload)
        while True:
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] in ("done", "stopped") or (m["type"] == "error" and m["message"].startswith("[HATA]")):
                return msgs


def test_baglama_dogrulama_ve_token_maskesi(client, admin, project, repo, make_user, login):
    bad = client.post("/suites/", json={"name": "x", "project_id": project["id"], "repo_url": "ftp://x"}, headers=admin)
    assert bad.status_code == 422
    s = _suite(client, admin, project, repo)
    assert s["token"].startswith("••••") and "gizli" not in json.dumps(s) and s["sync_status"] == "never"
    assert [p["name"] for p in s["profiles"]] == ["Smoke", "Güvenli"]
    make_user("tess", role="tester")
    assert client.post("/suites/", json={"name": "y", "project_id": project["id"], "repo_url": str(repo)}, headers=login("tess")).status_code == 403
    assert client.get("/suites/", headers=login("tess")).status_code == 200
    # maskeli token gönderilirse değişmez
    client.patch(f"/suites/{s['id']}", json={"token": s["token"], "branch": "main"}, headers=admin)
    from app.db.database import SessionLocal
    from app.modules.suites.models import AutomationSuite
    db = SessionLocal()
    try:
        assert db.get(AutomationSuite, s["id"]).token == "ghp_gizli_token_1234"
    finally:
        db.close()


def test_senkronizasyon_kesif_ve_ice_aktarma(client, admin, project, repo):
    env = _env(client, admin, project)
    s = _suite(client, admin, project, repo)                         # ortam yok → BASE_URL eksik
    st = client.post(f"/suites/{s['id']}/sync", headers=admin).json()
    assert st["sync_status"] == "error" and "BASE_URL" in st["sync_log"]

    client.patch(f"/suites/{s['id']}", json={"environment_id": env["id"]}, headers=admin)
    st = client.post(f"/suites/{s['id']}/sync", headers=admin).json()
    assert st["sync_status"] == "ready", st["sync_log"][-1500:]
    assert "Gizli-Sifre" not in st["sync_log"] and st["commit_sha"]
    sm = st["sync_summary"]
    assert sm["functions"] == 4 and sm["tests"] == 6 and sm["added"] == 4 and sm["markers"]["configure"] == 3

    cases = {c["automation_ref"]: c for c in client.get("/test-cases/", headers=admin).json() if c["suite_id"] == s["id"]}
    ref = "tests/configure/test_flows.py::TestFlows::test_create_flow_modal"
    assert cases[ref]["title"] == "Create Flow penceresi açılır" and cases[ref]["execution_type"] == "Automated"
    names = cases["tests/configure/test_flows.py::TestFlows::test_flow_names"]
    assert names["title"] == "Flow names" and set(json.loads(names["tags"])) == {"configure", "data_producing"}
    assert "bilinen-hata" in json.loads(cases["tests/configure/test_flows.py::TestFlows::test_known_bug"]["tags"])
    assert client.get(f"/suites/{s['id']}", headers=admin).json()["case_count"] == 4

    # Kullanıcı düzenlemesi korunur; depodan silinen test işaretlenir, yeni test eklenir
    cid = cases[ref]["id"]
    client.put(f"/test-cases/{cid}", json={"title": "Flow penceresi (düzenlendi)", "project_id": project["id"], "priority": "Kritik"}, headers=admin)
    (repo / "tests/smoke/test_login.py").unlink()
    (repo / "tests/smoke/test_home.py").write_text("import pytest\n\n@pytest.mark.smoke\ndef test_home():\n    pass\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "login testi taşındı")
    st = client.post(f"/suites/{s['id']}/sync", headers=admin).json()
    assert st["sync_summary"]["added"] == 1 and st["sync_summary"]["missing"] == 1, st["sync_log"][-800:]
    c = client.get(f"/test-cases/{cid}", headers=admin).json()
    assert c["title"] == "Flow penceresi (düzenlendi)" and c["priority"] == "Kritik"
    gone = next(x for x in client.get("/test-cases/", headers=admin).json() if x["automation_ref"] == "tests/smoke/test_login.py::test_login_page_opens")
    assert "depoda-yok" in json.loads(gone["tags"])


def test_secili_testleri_ve_profili_kostur(client, admin, project, repo):
    token = admin["Authorization"][7:]
    env = _env(client, admin, project)
    s = _suite(client, admin, project, repo, env)
    assert client.post(f"/suites/{s['id']}/sync", headers=admin).json()["sync_status"] == "ready"
    cases = {c["automation_ref"].rsplit("::", 1)[1]: c["id"] for c in client.get("/test-cases/", headers=admin).json() if c["suite_id"]}

    msgs = _ws(client, token, {"cases": list(cases.values())})
    text = "\n".join(m.get("message", "") for m in msgs)
    assert "Gizli-Sifre" not in text
    summary = next(m for m in msgs if m["type"] == "summary")
    assert summary["counts"] == {"passed": 2, "failed": 1, "skipped": 1}, text[-2000:]
    live = {(m["case_id"], m["status"]) for m in msgs if m["type"] == "case"}
    assert (cases["test_flow_names"], "running") in live and (cases["test_flow_names"], "failed") in live

    run = client.get(f"/test-runs/{summary['run_id']}", headers=admin).json()
    res = {r["case_id"]: r for r in json.loads(run["results"])}
    assert res[cases["test_flow_names"]]["status"] == "Failed" and "ikinci flow adı hatalı" in res[cases["test_flow_names"]]["actual_result"]
    assert res[cases["test_known_bug"]]["status"] == "Skipped" and res[cases["test_create_flow_modal"]]["status"] == "Passed"
    assert run["source"] == "automation" and run["meta"]["suite"]["name"] == "easycontact admin"
    defect = client.get("/defects/", headers=admin).json()[0]
    assert [d["case_id"] for d in defect["failed_details"]] == [cases["test_flow_names"]]

    # Profil: yalnız "not data_producing" → kalan test koşmaz
    msgs = _ws(client, token, {"suite_id": s["id"], "marker": "not data_producing"})
    summary = next(m for m in msgs if m["type"] == "summary")
    plan = next(m for m in msgs if m["type"] == "plan")
    assert cases["test_flow_names"] not in [c["case_id"] for c in plan["cases"]]
    assert summary["counts"] == {"passed": 2, "failed": 0, "skipped": 1}
    run = client.get(f"/test-runs/{summary['run_id']}", headers=admin).json()
    assert run["meta"]["profile"] == "not data_producing" and run["status"] == "Tamamlandı"

    # CI uç noktası ile profil
    r = client.post("/automation/runs", json={"suite_id": s["id"], "marker": "smoke"}, headers=admin).json()
    assert r["passed"] is True and r["counts"]["passed"] == 1

    # Depo testi script'li case'le aynı koşumda olamaz
    other = client.post("/test-cases/", json={"title": "Script", "project_id": project["id"], "execution_type": "Automated",
                                              "automation_script": "def test_x():\n    pass\n"}, headers=admin).json()["id"]
    err = _ws(client, token, {"cases": [cases["test_create_flow_modal"], other]})[-1]
    assert err["type"] == "error" and "aynı koşumda" in err["message"]


def test_hazir_olmayan_depo_ve_silme(client, admin, project, repo):
    token = admin["Authorization"][7:]
    env = _env(client, admin, project)
    s = _suite(client, admin, project, repo, env)
    err = _ws(client, token, {"suite_id": s["id"], "marker": ""})[-1]
    assert "senkronize edin" in err["message"]
    client.post(f"/suites/{s['id']}/sync", headers=admin)
    n = client.get(f"/suites/{s['id']}", headers=admin).json()["case_count"]
    r = client.delete(f"/suites/{s['id']}", headers=admin).json()
    assert r["cases"] == n and not r["cases_deleted"]
    left = [c for c in client.get("/test-cases/", headers=admin).json() if c["automation_ref"]]
    assert len(left) == n and all(c["suite_id"] is None for c in left)
    from app.modules.suites import workspace
    assert not workspace.suite_dir(s["id"]).exists()
