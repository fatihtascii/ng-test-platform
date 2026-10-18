'''
Test docstring'inden okunur case içeriği çıkarır.

Biçim (hepsi isteğe bağlı; yalnız ilk satır bile yeter):

    """Onaya gönderirken eksik alan hatası kullanıcıya gösterilir

    Flow'u zorunlu alanları boş bırakıp onaya gönderince backend'in errors[] listesindeki
    alan mesajları ekranda görünmeli.

    Ön koşul: Admin kullanıcıyla giriş yapılmış.

    Adımlar:
    1. Configure > Flows sayfasını aç -> Flow listesi görünür
    2. Yeni flow oluştur, alanları boş bırakıp "Send to approval"a bas
       -> Her eksik alan için hata mesajı görünür
    """

- İlk satır başlıktır.
- "Adımlar:" başlığına kadar olan metin açıklamadır ("Ön koşul:" satırı dahil). Paragraflar boş satırla ayrılır;
  paragraf içindeki satırlar tek satıra birleştirilir.
- Adımlar "1. eylem -> beklenen" biçimindedir ("→" de olur); girintili satırlar önceki adıma eklenir.
- Adımlardan sonra gelen "Not:" ile başlayan paragraf açıklamanın sonuna eklenir.
'''
import re

STEPS_HEADER = re.compile(r"^\s*(adımlar|adimlar|steps)\s*:\s*$", re.I)
STEP_LINE = re.compile(r"^\s*(\d+)[.)]\s+(.*)$")
ARROW = re.compile(r"\s+(?:->|→|=>)\s+")
NOTE_LINE = re.compile(r"^\s*(not|notlar|note)\s*:", re.I)


def _split(text: str) -> tuple[str, str]:
    parts = ARROW.split(text, maxsplit=1)
    return parts[0].strip(), (parts[1].strip() if len(parts) > 1 else "")


def parse(doc: str) -> dict:
    """{"title", "summary", "steps": [{"action", "expected"}]} — boş docstring'de hepsi boş."""
    lines = (doc or "").strip().splitlines()
    if not lines:
        return {"title": "", "summary": "", "steps": []}
    title = lines[0].strip().rstrip(".").strip()
    summary_lines: list[str] = []
    notes: list[str] = []
    steps: list[list[str]] = []      # [ham metin]
    mode = "summary"
    for line in lines[1:]:
        if STEPS_HEADER.match(line):
            mode = "steps"
            continue
        if mode == "steps":
            if not line.strip():
                continue
            m = STEP_LINE.match(line)
            if m:
                steps.append([m.group(2).strip()])
            elif NOTE_LINE.match(line):
                mode = "notes"
                notes.append(line.strip())
            elif steps:
                steps[-1].append(line.strip())
            continue
        (notes if mode == "notes" else summary_lines).append(line.rstrip())
    summary = _paragraphs(summary_lines + ([""] + notes if notes else []))
    parsed = []
    for raw in steps:
        action, expected = _split(" ".join(raw))
        parsed.append({"action": action, "expected": expected})
    return {"title": title[:500], "summary": summary, "steps": parsed}


def _paragraphs(lines: list[str]) -> str:
    """Boş satırla ayrılmış paragraflar; paragraf içindeki (satır kaydırmadan gelen) satırlar birleştirilir."""
    paras, cur = [], []
    for line in lines:
        if line.strip():
            cur.append(line.strip())
        elif cur:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    return "\n".join(paras)
