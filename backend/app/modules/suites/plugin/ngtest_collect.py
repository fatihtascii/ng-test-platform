"""
NG Test keşif eklentisi: `pytest --collect-only -p ngtest_collect` ile yüklenir.
Toplanan testleri (node id, işaretler, docstring'in ilk satırı) NG_COLLECT_OUT dosyasına JSON yazar.
Projenin kendi conftest'i çalıştıktan sonra (işaretler eklendikten sonra) okunur.
"""
import json
import os


def pytest_collection_finish(session):
    out = os.environ.get("NG_COLLECT_OUT")
    if not out:
        return
    items = []
    for it in session.items:
        obj = getattr(it, "obj", None)
        doc = (getattr(obj, "__doc__", None) or "").strip().split("\n")[0][:300]
        items.append({
            "nodeid": it.nodeid,
            "markers": sorted({m.name for m in it.iter_markers()}),
            "doc": doc,
        })
    with open(out, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
