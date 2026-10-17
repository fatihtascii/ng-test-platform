"""
Gizli değerlerin API yanıtlarında maskelenmesi.

Maskeli değer MASK ile başlar ve son 4 karakteri gösterir (ör. "••••••••ab12").
İstemci bu değeri değiştirmeden geri gönderirse "değişmedi" anlamına gelir;
servis katmanı kayıtlı gerçek değeri korur.
"""
MASK = "••••••••"


def mask_value(value, show_tail: bool = True) -> str:
    """show_tail=True: token'ları tanımak için son 4 karakteri gösterir (uzun değerlerde)."""
    if not isinstance(value, str) or not value:
        return value
    tail = value[-4:] if show_tail and len(value) > 8 else ""
    return f"{MASK}{tail}"


def is_masked(value) -> bool:
    return isinstance(value, str) and value.startswith(MASK)
