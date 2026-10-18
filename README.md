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
  `StatusBadge`, `Button`, `Panel`, `PageHeader`, `EmptyState`; tablolar için `data.jsx`
  (`SortHeader`, `Checkbox`, `Pagination`, `SearchInput`, `FilterSelect`, `Field`, `Tabs`);
  katmanlar için `overlay.jsx` (`Modal`, `Drawer`, `ConfirmDialog`, `Menu`) ve uygulama geneli
  bildirimler için `toast.js`.
- Büyük sayfalar kendi klasörüne bölünür. Örnek: `pages/test-cases/` (veri modeli, sorgu durumu,
  tablo, filtreler, detay/form paneli, diyaloglar); `pages/TestCases.jsx` yalnızca bunları birleştirir.
  Test case listesinin arama, filtre, sıralama, sayfa ve açık case bilgisi adres çubuğunda tutulur;
  bağlantı paylaşılabilir. Kısayollar: `/` ara, `n` yeni case, panelde `j`/`k` gezin, `e` düzenle,
  formda `Ctrl+S` kaydet.
- Yazı tipi IBM Plex Sans / Mono, projeye gömülü (`public/fonts`, SIL OFL); harici CDN gerekmez.
- Geçme oranı her ekranda aynı tanımı kullanır: **geçen / koşulan** (henüz koşulmamış case'ler paydada yok).

## Yetkilendirme

- `/auth/login` JWT döner; tüm API uç noktaları `Authorization: Bearer <token>` ister.
  WebSocket (`/ws/run-test`) ve SSE uç noktaları token'ı `?token=` ile alır.
- İzinler rol bazlıdır (`roles` / `role_permissions` tabloları) ve **Rol Yönetimi** sayfasından
  değiştirilir; değişiklik anında geçerli olur. `admin` rolü tüm izinlere sahiptir.
- Kayıt (`/auth/register`) her zaman `viewer` rolüyle hesap açar.

## Koşumlar ve planlar

- **Koşum kapsamı oluşturulurken sabitlenir:** plana bağlıysa planın case'leri, değilse projenin
  tüm case'leri "Bekliyor" olarak koşuma yazılır. Sonradan eklenen case'ler eski koşumları değiştirmez.
- **Koşum ekranı (`/test-runs/:id`)** sonuçları görüntüleme ve koşmayı birleştirir. Sonuçlar
  otomatik kaydedilir. Kısayollar: `j`/`k` gezin, `p` geçti, `f` kaldı, `s` atla, `n` not.
- **Koşum tamamlanınca** sonuçlar case'lerin son sonucuna, bağlı planın kalemlerine ve koşumun
  ortak hata kaydına yansır. Tamamlanan koşum yeniden açılabilir.
- **Plan sayfası (`/test-plans/:id`)** kalemleri, toplu sonuç/çıkarma işlemlerini, çoklu case
  eklemeyi ve plana bağlı koşumları gösterir. Plan kalemi sonucu da case'in son sonucunu günceller.
- Kimlikler: `TC-` case, `KS-` koşum, `TP-` plan, `BUG-` hata kaydı.

## Ortamlar, değişkenler ve kullanıcılar

- **Ortam değişkenleri otomasyona aktarılır:** Otomasyon ekranında seçilen ortamın adresi `BASE_URL`
  ve Playwright `base_url` olarak, değişkenleri de ortam değişkeni olarak test sürecine verilir.
  Kapsam önceliği: ortam > proje > global. `GET /environments/{id}/resolved` sonucu gösterir.
- **Sırlar:** listede herkese maskeli döner; yönetici tek tek açar (`GET /variables/{id}/value`).
  Koşum loglarında, WebSocket akışında ve hata kayıtlarında sır değerleri maskelenir. Maskeli
  değerle yapılan güncelleme kayıtlı değeri korur.
- **Kullanıcı devre dışı bırakma:** devre dışı hesap giriş yapamaz, açık oturumları hemen düşer,
  kayıtları korunur (migration `0005`). Son giriş zamanı tutulur.
- **Admin koruması:** admin hesabının profilini, şifresini, durumunu ve kendisini yalnızca admin
  değiştirebilir/silebilir.

## Hata takibi (defect)

Hata kayıtları `defects` tablosunda, geçmişleri `defect_activity` tablosunda tutulur:

- **Otomatik:** Bir koşumda Kaldı sonucu olduğunda o koşuma bağlı tek bir kayıt açılır/güncellenir.
  Çözüldü denmiş bir kayıtta hata tekrarlarsa kayıt yeniden açılır ve bu, geçmişe "Sistem" adına yazılır.
- **Manuel:** Hatalar sayfasından, koşum ekranındaki ve plan maddesindeki "Hata kaydı aç" düğmesinden.
  Koşum notu, kaydın "gerçekleşen sonuç" alanına taşınır.
- **İş akışı:** Açık → İnceleniyor → Tekrar test → Çözüldü. Detay sayfasındaki düğme bir sonraki adımı önerir;
  çözülme zamanı (`resolved_at`) tutulur, açık kalma ve çözüm süresi buradan hesaplanır.
- **Atama:** `assignee_id` ile kişiye atanır; liste "Bana atanan", "Atanmamış" ve kişi filtreleri sunar.
  Atama listesi `GET /defects/assignees` (yalnızca aktif kullanıcılar, `users.view` gerekmez).
- **Geçmiş ve yorumlar:** Durum, önem, atanan ve başlık değişiklikleri (toplu işlemler dahil) otomatik kaydedilir.
  `GET /defects/{id}/activity`, `POST /defects/{id}/comments`; yorumu yalnızca sahibi düzenler, sahibi veya admin siler.
- **Toplu işlemler:** `POST /defects/bulk-status`, `POST /defects/bulk-assign` (yalnızca değişen kayıtları sayar).
- Liste filtreleri adres çubuğunda tutulur (`?status=active&assignee=me`); seçili kayıtlar CSV olarak indirilebilir
  veya Jira/Slack'e yapıştırmaya uygun metin olarak kopyalanabilir.
- Otomasyon koşumu (WebSocket) sonucu normal bir test koşumu olarak kaydedilir, case statüleri güncellenir.

## Projeler

- Ad zorunlu, en fazla 200 karakter; fazla boşluklar temizlenir ve ad büyük/küçük harf (Türkçe İ/ı dahil)
  gözetmeksizin benzersizdir (aynı ad → 409).
- Statü: `Aktif`, `Beklemede`, `Tamamlandı`. `PATCH /projects/{id}` kısmi güncelleme yapar (`PUT` da aynı şekilde çalışır).
- `GET /projects/?with_stats=true` her projeye case (duruma göre), otomasyon, plan, koşum, son koşum, açık/kritik hata
  ve ortam sayılarını ekler. Sayılar gruplanmış sorgularla hesaplanır; proje sayısı arttıkça sorgu sayısı artmaz.
  Varsayılan liste hafif kalır.
- Proje silinince case, plan, koşum, ortam ve hata kayıtları (yorumları dahil) da silinir. Arayüz silinecekleri
  sayar ve onay için proje adının yazılmasını ister.

## Raporlar

Raporlar sayfası seçili dönem (7 / 30 / 90 gün, tüm zamanlar) ve proje için hesaplanır; filtreler adres çubuğunda
tutulur (`/reports?range=90&project=2`). Hesaplar `frontend/src/pages/reports/metrics.js` içindeki saf fonksiyonlardadır.

- **Geçme oranı** her yerde geçen / (geçen + kalan); atlanan ve bekleyen paydaya girmez. Önceki eşit döneme göre
  fark yüzde puan olarak gösterilir.
- **Test kapsamı:** dönemde en az bir kez sonuç alan case oranı.
- **Trend:** 31 güne kadar günlük, daha uzun dönemlerde haftalık; sonuç adetleri ve geçme oranı iki ayrı grafikte,
  ayrıca tablo görünümü.
- **En çok kalan testler:** kaldı / koşuldu sayısı ve son sonuçlar; dönem içinde geçip kalmaya devam eden testler
  "kararsız" olarak işaretlenir.
- **Hatalar:** açık kayıtların öneme göre dağılımı, dönemde açılan/çözülen ve ortalama çözüm süresi.
- **Dışa aktarma** (`reports.export` izni): 7 sayfalı Excel ya da tarayıcının yazdırma penceresinden PDF
  (yazdırırken menüler gizlenir).

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
