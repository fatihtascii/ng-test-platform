"""
Otomasyon deposunun sunucudaki çalışma alanı: <NG_DATA_DIR>/suites/<id>/{repo, venv}

- Depo token'la çekilir; token URL'ye ya da diske yazılmaz, yalnız o komutun HTTP başlığına eklenir.
- Projenin bağımlılıkları backend'den ayrı bir sanal ortama kurulur (requirements değişince yeniden).
- Testler pytest'in kendi toplama mekanizmasıyla, projenin conftest'i çalıştırılarak keşfedilir.
"""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable, Optional

PLUGIN_DIR = str(Path(__file__).parent / "plugin")
BUILTIN_MARKS = {"parametrize", "usefixtures", "filterwarnings", "skip", "skipif", "xfail", "timeout", "flaky", "asyncio", "django_db"}
Log = Callable[[str], None]


class SyncError(Exception):
    pass


def data_dir() -> Path:
    return Path(os.getenv("NG_DATA_DIR") or (Path.home() / ".ng-test")).expanduser()


def suite_dir(suite_id: int) -> Path:
    return data_dir() / "suites" / str(suite_id)


def repo_dir(suite_id: int) -> Path:
    return suite_dir(suite_id) / "repo"


def venv_python(suite_id: int) -> str:
    v = suite_dir(suite_id) / "venv"
    return str(v / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))


def allow_local_repos() -> bool:
    return os.getenv("NG_SUITE_ALLOW_LOCAL") == "1"


def validate_repo_url(url: str) -> str:
    url = (url or "").strip()
    if allow_local_repos() and (url.startswith("file://") or url.startswith("/")):
        return url
    if not re.match(r"^https://[\w.-]+/[\w.-]+/[\w.-]+?(\.git)?/?$", url):
        raise ValueError("Depo adresi https://github.com/sahip/depo biçiminde olmalı.")
    return url.rstrip("/")


def _run(cmd: list[str], log: Log, cwd: Optional[str] = None, env: Optional[dict] = None, timeout: int = 900,
         secret: Optional[str] = None) -> str:
    """Komutu çalıştırır, çıktıyı satır satır log'a verir (sır maskelenir); hata olursa SyncError."""
    shown = " ".join(c if not secret or secret not in c else "***" for c in cmd)
    log(f"$ {shown}")
    try:
        p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise SyncError(f"Komut {timeout} saniyede bitmedi: {cmd[0]}")
    except FileNotFoundError:
        raise SyncError(f"'{cmd[0]}' bulunamadı. Sunucuda kurulu olmalı.")
    out = (p.stdout or "") + (p.stderr or "")
    if secret:
        out = out.replace(secret, "***")
    for line in out.strip().splitlines()[-40:]:
        log("  " + line)
    if p.returncode != 0:
        raise SyncError(f"Komut başarısız oldu (çıkış kodu {p.returncode}).")
    return out


def _git(token: Optional[str]) -> list[str]:
    cmd = ["git", "-c", "advice.detachedHead=false"]
    if token:
        basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
        cmd += ["-c", f"http.extraHeader=Authorization: Basic {basic}"]
    return cmd


def fetch_repo(suite_id: int, url: str, branch: str, token: Optional[str], log: Log) -> tuple[str, str]:
    """Depoyu çeker ya da günceller; (commit sha, commit mesajı) döner."""
    rd = repo_dir(suite_id)
    rd.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    basic = base64.b64encode(f"x-access-token:{token}".encode()).decode() if token else None
    if not (rd / ".git").exists():
        _run(_git(token) + ["clone", "--depth", "50", "--branch", branch, "--single-branch", url, str(rd)], log, env=env, secret=basic)
    else:
        _run(_git(token) + ["fetch", "--depth", "50", "origin", branch], log, cwd=str(rd), env=env, secret=basic)
        _run(["git", "reset", "--hard", "FETCH_HEAD"], log, cwd=str(rd), env=env)
        _run(["git", "clean", "-fd"], log, cwd=str(rd), env=env)
    sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=rd, capture_output=True, text=True).stdout.strip()
    msg = subprocess.run(["git", "log", "-1", "--format=%s"], cwd=rd, capture_output=True, text=True).stdout.strip()
    return sha, msg[:500]


def ensure_venv(suite_id: int, log: Log):
    """Sanal ortamı kurar; requirements.txt değiştiyse bağımlılıkları (ve gerekirse Playwright tarayıcısını) yükler."""
    sd, rd = suite_dir(suite_id), repo_dir(suite_id)
    venv = sd / "venv"
    if not Path(venv_python(suite_id)).exists():
        # Sistem paketleri görünür: pytest gibi ortak araçlar tekrar indirilmez; projenin sabitlediği sürümler yine venv'e kurulur
        _run([sys.executable, "-m", "venv", "--system-site-packages", str(venv)], log)
    req = rd / "requirements.txt"
    if not req.exists():
        log("requirements.txt yok; bağımlılık kurulmadı.")
        return
    text = req.read_text(encoding="utf-8", errors="replace")
    digest = hashlib.sha256(text.encode()).hexdigest()
    stamp = sd / "requirements.sha256"
    if stamp.exists() and stamp.read_text().strip() == digest:
        log("Bağımlılıklar güncel.")
        return
    _run([venv_python(suite_id), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", str(req)], log, cwd=str(rd), timeout=1800)
    if re.search(r"^\s*playwright\b", text, re.M | re.I) and os.getenv("NG_SUITE_SKIP_BROWSERS") != "1":
        _run([venv_python(suite_id), "-m", "playwright", "install", "chromium"], log, timeout=1800)
    stamp.write_text(digest)


def collect(suite_id: int, test_path: str, env_vars: dict, log: Log, marker: Optional[str] = None) -> list[dict]:
    """pytest --collect-only ile testleri toplar. Dönüş: [{nodeid, markers, doc}]"""
    rd = repo_dir(suite_id)
    target = (rd / (test_path or ".")).resolve()
    if rd.resolve() not in [target, *target.parents]:
        raise SyncError("Test klasörü depo dışını gösteremez.")
    with tempfile.NamedTemporaryFile("r", suffix=".json", delete=False) as tmp:
        out_path = tmp.name
    env = {**os.environ, **env_vars, "NG_COLLECT_OUT": out_path, "PYTHONDONTWRITEBYTECODE": "1",
           "PYTHONPATH": os.pathsep.join(filter(None, [PLUGIN_DIR, os.environ.get("PYTHONPATH")]))}
    cmd = [venv_python(suite_id), "-m", "pytest", "--collect-only", "-q", "-p", "ngtest_collect", "-p", "no:cacheprovider",
           str(target.relative_to(rd.resolve())) if target != rd.resolve() else "."]
    if marker:
        cmd += ["-m", marker]
    try:
        try:
            _run(cmd, log, cwd=str(rd), env=env, timeout=600)
        except SyncError as e:
            # pytest "hiç test yok" (5) dışındaki hatalar keşfi durdurur
            if not os.path.getsize(out_path):
                raise SyncError(f"Testler toplanamadı: {e} Ortam değişkenleri (ör. BASE_URL) eksik olabilir; yukarıdaki çıktıya bakın.")
        with open(out_path, encoding="utf-8") as f:
            content = f.read()
        return json.loads(content) if content else []
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def base_nodeid(nodeid: str) -> str:
    return nodeid.split("[", 1)[0]


BROWSER_PARAM = re.compile(r"^(chromium|firefox|webkit)(-|$)")


def group_tests(items: list[dict]) -> list[dict]:
    """
    Parametreli testleri tek kayıtta toplar: [{ref, markers, doc, params}]
    params: tarayıcı parametresi (pytest-playwright'ın [chromium] eki) dışındaki farklı varyasyon sayısı.
    """
    out: dict[str, dict] = {}
    for it in items:
        ref = base_nodeid(it["nodeid"])
        g = out.setdefault(ref, {"ref": ref, "markers": set(), "doc": it.get("doc") or "", "variants": set()})
        g["markers"].update(m for m in it.get("markers", []) if m not in BUILTIN_MARKS)
        if "xfail" in it.get("markers", []):
            g["markers"].add("bilinen-hata")
        if "[" in it["nodeid"]:
            pid = BROWSER_PARAM.sub("", it["nodeid"].split("[", 1)[1].rstrip("]"))
            if pid:
                g["variants"].add(pid)
    return [{"ref": g["ref"], "markers": sorted(g["markers"]), "doc": g["doc"], "params": len(g["variants"])} for g in out.values()]


def humanize(ref: str) -> str:
    """'tests/flows/test_flows.py::TestCreate::test_create_flow_modal' → 'Create flow modal'"""
    name = ref.rsplit("::", 1)[-1]
    name = re.sub(r"^test_?", "", name).replace("_", " ").strip()
    return (name[:1].upper() + name[1:]) if name else ref


def junit_key(ref: str) -> tuple[str, str]:
    """Depo node id'sini JUnit (classname, name) anahtarına çevirir."""
    path, *rest = ref.split("::")
    module = path[:-3] if path.endswith(".py") else path
    module = module.replace("/", ".").replace("\\", ".")
    *classes, func = rest if rest else [""]
    return ".".join([module, *classes]), func
