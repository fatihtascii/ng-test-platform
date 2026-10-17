# NG Test Platform

Test yönetim platformu: projeler, test case'ler, test planları, koşumlar, defect takibi,
ortam/değişken yönetimi, Slack/Jira/GitHub entegrasyonları ve Playwright tabanlı otomasyon koşumu.

| Katman   | Teknoloji |
|----------|-----------|
| Backend  | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (geliştirmede SQLite da olur), JWT |
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Otomasyon| pytest + Playwright (WebSocket üzerinden canlı log) |

## Kurulum

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # DATABASE_URL ve JWT_SECRET_KEY'i doldurun
uvicorn app.main:app --reload --port 8000
```

- Veritabanı şeması açılışta **otomatik migrate edilir** (`alembic upgrade head`).
  Alembic öncesi bir veritabanı varsa önce baseline olarak işaretlenir.
- İlk admin kullanıcısı: `python create_admin.py <kullanici_adi>`
- API dokümantasyonu: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev                 # http://localhost:3000
```

## Arayüz

Tasarım dili "hassas ölçüm aracı": soğuk grafit nötrler, ince çizgiler, kompakt satırlar.
Renk yalnızca anlam taşır.

| Renk ölçeği | Anlam |
|-------------|-------|
| `emerald`   | geçti |
| `rose`      | kaldı / hata |
| `amber`     | bloklu / uyarı |
| `violet`    | bekliyor (nötr) |
| `indigo`    | etkileşim (buton, link, odak) |

- Token'lar `frontend/src/index.css` içindeki `@theme` bloğunda. Tailwind'in renk, köşe ve gölge
  ölçekleri burada yeniden tanımlandığı için sayfalardaki sınıflar otomatik olarak bu dile uyar.
- Ortak bileşenler `frontend/src/components/ui/`: `ResultBar` (geçti/kaldı/bekliyor şeridi),
  `StatusBadge`, `Button`, `Panel`, `PageHeader`, `EmptyState`.
- Yazı tipi IBM Plex Sans / Mono, projeye gömülü (`public/fonts`, SIL OFL); harici CDN gerekmez.
- Geçme oranı her ekranda aynı tanımı kullanır: **geçen / koşulan** (henüz koşulmamış case'ler paydada yok).

## Yetkilendirme

- `/auth/login` JWT döner; tüm API uç noktaları `Authorization: Bearer <token>` ister.
  WebSocket (`/ws/run-test`) ve SSE uç noktaları token'ı `?token=` ile alır.
- İzinler rol bazlıdır (`roles` / `role_permissions` tabloları) ve **Rol Yönetimi** sayfasından
  değiştirilir; değişiklik anında geçerli olur. `admin` rolü tüm izinlere sahiptir.
- Kayıt (`/auth/register`) her zaman `viewer` rolüyle hesap açar.

## Defect takibi

Defect'ler `defects` tablosunda tutulur:

- **Otomatik:** Bir koşumda başarısız sonuç olduğunda o koşuma bağlı tek bir defect açılır/güncellenir.
  Çözüldü (Resolved) denmiş bir defect'te hata tekrarlarsa yeniden "Açık" olur.
- **Manuel:** Hatalar sayfasından veya koşum/plan ekranındaki "Defect aç" butonundan.
- Otomasyon koşumu (WebSocket) sonucu normal bir test koşumu olarak kaydedilir, case statüleri güncellenir.

## Testler

```bash
cd backend && python -m pytest       # geçici SQLite üzerinde çalışır, .env'deki DB'ye dokunmaz
cd frontend && npm run lint && npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) her push'ta backend testlerini, PostgreSQL üzerinde
migration'ları (yukarı/aşağı) ve frontend lint + build'i çalıştırır.

## Migration ekleme

```bash
cd backend
alembic revision --autogenerate -m "aciklama"   # üretilen dosyayı gözden geçirin
alembic upgrade head
```
