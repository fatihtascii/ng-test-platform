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
- Otomasyon koşumunda kalan testler, o koşuma bağlı otomatik hata kaydına düşer (bkz. Otomasyon).

## Entegrasyonlar

Ayarlar Entegrasyonlar sayfasından yapılır; sırlar (webhook, token, secret) API yanıtlarında maskelenir.
Olaylara bağlı işler veritabanı commit'inden **sonra** arka planda çalışır (`integrations/hooks.py`): bir Slack/Jira
gecikmesi isteği yavaşlatmaz, geri alınan işlem bildirim üretmez, entegrasyon hatası asıl kaydı bozmaz.
Her gönderim sonucu `integration_events` tablosunda tutulur ve sayfada "Son gönderimler" olarak görünür.

- **Slack:** koşum bitince (yalnız kalan test varsa / her zaman / hiç) özet mesajı; yeni hata kaydı bildirimi.
- **Jira:** hata detayındaki "Jira'ya aktar" (`POST /defects/{id}/jira`) kaydı Jira'da açar, anahtarı ve adresi
  hata kaydına yazar; istenirse her yeni hata kaydı otomatik aktarılır. Önem → öncelik eşlenir.
- **GitHub:** `POST /webhooks/github` (imza `X-Hub-Signature-256` ile doğrulanır). Seçilen dala push ya da başarılı
  deployment olayında ayarlardaki projenin otomasyon testleri koşar; commit'e "NG Test / otomasyon" durumu yazılır.
- **Herhangi bir CI:** `POST /automation/runs` (`automation.execute` izni) koşum bitene kadar bekler ve
  `{"run_id", "counts", "passed", "url"}` döner.
- `APP_URL` ortam değişkeni bildirimlerdeki bağlantıların adresidir (varsayılan `http://localhost:3000`).

## Otomasyon

Motor `backend/app/modules/automation` altındadır (`runner.py` saf yardımcılar, `router.py` WebSocket akışı).

- Her case'in script'i geçici klasörde `test_case_{id}_{rastgele}.py` dosyasına yazılır ve pytest ile koşulur.
  Sonuçlar case'lere dosya adından eşlenir: canlı durum `pytest -v` çıktısından, kesin sonuç (süre ve hata mesajıyla)
  JUnit raporundan okunur. Bir dosyada birden fazla test fonksiyonu varsa biri kalırsa case kalmış sayılır.
- Script'i olmayan case "atlandı" olarak koşuma eklenir. Bir case'teki sözdizimi/import hatası yalnız o case'i
  etkiler (`--continue-on-collection-errors`).
- Koşumu **yalnızca sunucu** kaydeder (`test_runs.source = 'automation'`, `meta`: tarayıcı, ortam, süre).
  Kalan testler için otomatik hata kaydı açılır, case statüleri güncellenir.
- "Durdur" veya bağlantının kopması pytest sürecini sonlandırır; durdurulan koşum kaydedilmez.
- Ortam seçilirse adres `--base-url` ve `BASE_URL`, değişkenler ortam değişkeni olarak verilir; sırlar çıktıda maskelenir.
- Ayarlar: `AUTOMATION_TIMEOUT_SEC` (varsayılan 1800), `AUTOMATION_MAX_PARALLEL` (varsayılan 2 eşzamanlı koşum).
- WebSocket sözleşmesi `router.py` başındaki açıklamada. Arayüz case bazında canlı durum, çıktı (filtre, kopyala,
  indir) ve son otomasyon koşumlarını gösterir; kalan case'ler tek tıkla yeniden koşulabilir.

### Otomasyon depoları

Mevcut bir pytest/Playwright projesi (ör. GitHub deposu) NG Test'e bağlanabilir; kodu kopyalamaya gerek yoktur.
Modül: `backend/app/modules/suites` (migration `0009`).

- **Bağlama:** Otomasyon → Depolar → *Depo bağla*. Adres `https://github.com/sahip/depo` biçimindedir. Özel depo için
  yalnızca okuma izinli bir token girin (GitHub fine-grained token, *Contents: Read-only*). Token şifreli alanda tutulur,
  API'de maskelenir, git'e `http.extraHeader` ile verilir; adreste, komut satırında veya günlükte görünmez.
- **Senkronizasyon:** depo `NG_DATA_DIR` (varsayılan `~/.ng-test`) altındaki `suites/<id>/repo` klasörüne çekilir.
  Ayrı bir sanal ortam (`suites/<id>/venv`) kurulur, `requirements.txt` değiştiğinde yeniden yüklenir. Requirements
  playwright içeriyorsa Chromium da indirilir. Sunucuda `git` ve Python 3 bulunmalıdır.
- **Case eşlemesi:** her test fonksiyonu bir case olur (`test_cases.suite_id` + `automation_ref` = pytest node id).
  Parametre varyantları aynı case'te toplanır; varyantlardan biri kalırsa case kalır. Docstring açıklama/başlık,
  pytest işaretleri (marker) etiket olur. `xfail` işaretli testler `bilinen-hata` etiketini alır. Yeniden
  senkronizasyonda başlık, öncelik ve el ile eklenen etiketler korunur. Depodan silinen testler silinmez,
  `depoda-yok` etiketi alır ve koşulmaz.
- **Ortam değişkenleri:** depo `.env` dosyası yerine depoya seçilen NG Test ortamının değişkenleri kullanılır.
  Örneğin `BASE_URL`, `ADMIN_EMAIL` normal; `ADMIN_PASSWORD`, `INVITED_PASSWORD` gibi değerler **sır** olarak
  eklenir ve çıktıda maskelenir.
- **Profiller:** pytest `-m` ifadesidir. Önerilenler: Smoke = `smoke`, Deploy sonrası = `deploy`,
  Güvenli = `not data_producing` (kayıt bırakan testleri dışarıda bırakır). Profil boşsa tüm depo koşulur.
- **Koşum:** Otomasyon → Koşum'da *Kaynak: Depo* seçilip profil ya da tek tek testler koşulur. Komut deponun kendi
  `pytest.ini`/`conftest.py` ayarlarıyla depo klasöründe çalışır. Sonuçlar JUnit üzerinden case'lere eşlenir. Depo ve
  script'li case'ler aynı koşumda karıştırılamaz.
- **CI'dan:** `POST /automation/runs` gövdesine `{"suite_id": 1, "marker": "smoke"}` verilebilir.
- **Yetki:** depo bağlama, düzenleme, silme ve senkronizasyon `automation.manage` iznini ister (admin ve yönetici
  rollerinde varsayılan). Görüntülemek için `automation.view` yeterlidir.
- Testlerde kullanılan bayraklar: `NG_SUITE_ALLOW_LOCAL=1` yerel klasörü depo adresi olarak kabul eder,
  `NG_SUITE_SKIP_BROWSERS=1` tarayıcı indirmesini atlar.

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
