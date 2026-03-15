# DM Asistan CRM — Proje Durum Raporu

**Tarih:** 15 Mart 2026
**Branch:** `feature/n8n-workflow-integration`
**Repo:** https://github.com/MuhammetEnesDemirkol/demars-crm

---

## Proje Nedir?

Türk KOBİ'ler için multi-tenant WhatsApp AI müşteri iletişim platformu.
Bir işletme WhatsApp numarasına gelen mesajları yapay zeka ile yanıtlar, sipariş alır, ödeme takibi yapar ve firma sahibine bildirim gönderir.

**Örnek senaryo:** Müşteri WhatsApp'tan "5 kilo domates istiyorum" yazar → AI siparişi alır, adres ister, IBAN gönderir, dekont beklenir, firma sahibine bildirim gider.

---

## Tech Stack

| Katman | Teknoloji | Durum |
|--------|-----------|-------|
| **Otomasyon** | n8n (self-hosted, RepoCloud.io) | ✅ Çalışıyor |
| **Veritabanı** | Supabase (PostgreSQL + RLS) | ✅ Kurulu |
| **AI** | GPT-4o-mini (sınıflandırma) + GPT-4o (yanıt) | ✅ Bağlı |
| **Dashboard** | Next.js 14, Vercel | ✅ Deploy edildi |
| **WhatsApp** | Meta WhatsApp Cloud API (test modu) | ⏳ Webhook kaydı bekliyor |

---

## Altyapı Bilgileri

```
Supabase Project ID : xifklnqcnkweubbgohgy
Supabase URL        : https://xifklnqcnkweubbgohgy.supabase.co
Dashboard URL       : https://dm-asistan-dashboard.vercel.app
n8n URL             : RepoCloud.io üzerinde self-hosted
GitHub Repo         : https://github.com/MuhammetEnesDemirkol/demars-crm
```

---

## Branching Stratejisi

```
master          ← production (sadece develop'tan PR ile güncellenir)
  └── develop   ← entegrasyon (feature branch'ler buraya PR açar)
        └── feature/xxx  ← aktif geliştirme
```

**Mevcut aktif branch:** `feature/n8n-workflow-integration`

---

## Veritabanı Şeması

8 tablo, tümünde RLS aktif, `firm_id` bazlı multi-tenant izolasyon:

```
firms               → işletme tanımları (IBAN, WhatsApp token, wa_phone_number_id)
products            → ürün kataloğu (fiyat, stok, birim)
faqs                → sık sorulan sorular (AI sistem promptuna eklenir)
customers           → müşteri kaydı (whatsapp_phone unique per firm)
conversations       → konuşma oturumları (state machine)
messages            → her mesaj (inbound/outbound, yön ve içerik)
orders              → siparişler (müşteri, ürün, adres, durum)
notifications       → firma sahibine bildirimler
```

**Konuşma state machine:**
```
active → awaiting_address → awaiting_payment → summarized
```

**Kritik alan:** `firms.wa_phone_number_id` — webhook routing key.
Gelen mesajdaki `phone_number_id` bu alana göre eşleştirilir, hangi firmanın mesajı olduğu bulunur.

---

## n8n Workflow'ları

### WF-001 — Main Message Handler
**Dosya:** `n8n/workflows/WF-001-main-message-handler.json`
**Durum:** ✅ Import sorunu çözüldü (ChatGPT yardımıyla)

**Akış:**
```
WhatsApp Webhook GET  → Meta doğrulama (hub.challenge)
WhatsApp Webhook POST → Mesaj al
  → Mesaj var mı? (IF)
  → Firma bul (Supabase GET)
  → Firma var mı? (IF)
  → Müşteri upsert et
  → Aktif konuşma var mı? (IF)
  → Konuşma oluştur/getir
  → Gelen mesajı kaydet
  → State kontrolü zinciri:
      awaiting_address?  → WF-002'yi tetikle
      awaiting_payment + image? → WF-003'ü tetikle
      awaiting_payment?  → Ödeme hatırlatması gönder
      active?            → Intent sınıfla → WF-002 veya AI yanıt
  → AI yanıt üret (GPT-4o)
  → WhatsApp'a gönder
  → Yanıtı kaydet
```

**Import sorununda yaşanan süreç:**
Orijinal dosya n8n 2.10.4'e import edilemiyordu (`Could not find property option` hatası).
5 tur düzeltme yapıldı: respondToWebhook typeVersion, IF node operator değerleri (`equal`→`equals`), Switch node kaldırılıp IF zinciriyle değiştirildi, boolean operatörleri (`operation: "true"`), conditions içi `options` bloğu yapısı düzeltildi.

---

### WF-002 — IBAN Order Flow
**Dosya:** `n8n/workflows/WF-002-iban-order-flow.json`
**Durum:** ✅ Düzeltildi (respondToWebhook uyumluluğu)

**Akış:** Sipariş niyeti tespit edilince tetiklenir → GPT-4o ile sipariş detaylarını çıkar → Sipariş oluştur → Adres iste → Konuşma state'ini `awaiting_address`'e çek → IBAN bilgilerini gönder.

---

### WF-003 — Receipt Analysis
**Dosya:** `n8n/workflows/WF-003-receipt-analysis.json`
**Durum:** ✅ Düzeltildi (respondToWebhook uyumluluğu)

**Akış:** Müşteri ödeme dekontu (görsel) gönderince tetiklenir → Vision API ile dekont doğrula → Ödeme onaylandıysa sipariş state'ini güncelle → WF-005'i tetikle.

---

### WF-005 — Firm Notifications
**Dosya:** `n8n/workflows/WF-005-firm-notifications.json`
**Durum:** ✅ Düzeltildi (respondToWebhook uyumluluğu)

**Akış:** Firma sahibine WhatsApp bildirimi gönderir (yeni sipariş, ödeme onayı vb.).

---

### WF-004 — Conversation Summary *(henüz oluşturulmadı)*
Günlük konuşma özetleri, `summarized` state'e geçiş.

### WF-006 — Payment Reminder *(henüz oluşturulmadı)*
Scheduler ile ödeme hatırlatması.

---

## HTTP Request vs Native Node Tercihi

Tüm Supabase ve OpenAI çağrıları için **n8n-nodes-base.httpRequest** kullanıldı. Nedenleri:

1. **Supabase için resmi n8n node yok** — PostgREST API doğrudan HTTP ile çağrılır
2. **n8n Variables (`$vars`) ile uyumluluk** — Credential store yerine `$vars.SUPABASE_URL` gibi değişkenler kullanılır
3. **Tam PostgREST operatör desteği** — `in.(active,awaiting_address)`, `order`, `select` gibi kompleks sorgular
4. **Multi-tenant esneklik** — Her firma kendi `wa_access_token`'ını kullanır, statik credential olmaz
5. **Görünürlük** — Request/response tamamen izlenebilir

---

## Next.js Dashboard

**URL:** https://dm-asistan-dashboard.vercel.app
**Durum:** ✅ Vercel'e deploy edildi

**Sayfalar:**

| Route | Sayfa | Durum |
|-------|-------|-------|
| `/dashboard` | Ana panel (özet kartlar) | ✅ |
| `/dashboard/conversations` | Konuşmalar listesi | ✅ |
| `/dashboard/conversations/[id]` | Konuşma detayı | ✅ |
| `/dashboard/orders` | Siparişler | ✅ |
| `/dashboard/notifications` | Bildirimler | ✅ |
| `/dashboard/settings` | Ayarlar | ✅ |
| `/dashboard/settings/products` | Ürün yönetimi | ✅ |
| `/dashboard/settings/faqs` | SSS yönetimi | ✅ |

**Auth:** Supabase Auth (magic link / email+password). Test kullanıcısı henüz oluşturulmadı.

**Önemli not:** Dashboard route yapısı `app/(dashboard)/` → `app/dashboard/` olarak değiştirildi.
URL'ler: `/conversations` yerine artık `/dashboard/conversations`

**Env vars (Vercel):**
```
NEXT_PUBLIC_SUPABASE_URL      = https://xifklnqcnkweubbgohgy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = [Vercel'e yüklendi]
```

---

## Tamamlanan Görevler

### Faz 1 — Veritabanı
- [x] Core tablolar: `firms`, `products`, `faqs`, `customers`
- [x] Konuşma & sipariş tabloları: `conversations`, `messages`, `orders`, `notifications`
- [x] RLS politikaları (firm_id bazlı izolasyon)
- [x] Performans indexleri
- [x] `get_user_firm_id()` fonksiyonu

### Faz 1 — n8n Workflow'ları
- [x] WF-001 oluşturuldu ve import sorunu çözüldü
- [x] WF-002 oluşturuldu
- [x] WF-003 oluşturuldu
- [x] WF-005 oluşturuldu
- [ ] WF-004 (Conversation Summary)
- [ ] WF-006 (Payment Reminder)
- [ ] n8n Variables kurulumu (SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, WF_00x_WEBHOOK_URL)
- [ ] Workflow'ların aktifleştirilmesi (sıra önemli: WF-005 → WF-003 → WF-002 → WF-001)
- [ ] Meta Developer Console'da webhook kaydı

### Faz 1 — Dashboard
- [x] Next.js 14 scaffold
- [x] Supabase Auth entegrasyonu
- [x] Tüm sayfalar (conversations, orders, notifications, settings, products, faqs)
- [x] Vercel deployment
- [ ] Supabase Auth test kullanıcısı oluşturma
- [ ] Supabase Auth URL konfigürasyonu (`https://dm-asistan-dashboard.vercel.app` eklenmeli)

---

## Bekleyen Kritik Adımlar

### 1. n8n Variables Kur (n8n → Settings → Variables)
```
SUPABASE_URL          = https://xifklnqcnkweubbgohgy.supabase.co
SUPABASE_SERVICE_KEY  = [Supabase dashboard → Settings → API → service_role key]
OPENAI_API_KEY        = [OpenAI dashboard]
WF_002_WEBHOOK_URL    = (WF-002 aktifleştirildikten sonra alınacak)
WF_003_WEBHOOK_URL    = (WF-003 aktifleştirildikten sonra alınacak)
WF_005_WEBHOOK_URL    = (WF-005 aktifleştirildikten sonra alınacak)
```

### 2. Workflow Aktivasyon Sırası
```
1. WF-005 aktifleştir → webhook URL'sini al → WF_005_WEBHOOK_URL variable'ına yaz
2. WF-003 aktifleştir → webhook URL'sini al → WF_003_WEBHOOK_URL variable'ına yaz
3. WF-002 aktifleştir → webhook URL'sini al → WF_002_WEBHOOK_URL variable'ına yaz
4. WF-001 aktifleştir → Production webhook URL'ini al
5. Meta Developer Console → WhatsApp → Webhooks → bu URL'i kaydet
```

### 3. Supabase Auth Konfigürasyonu
- Supabase → Authentication → URL Configuration
- Site URL: `https://dm-asistan-dashboard.vercel.app`
- Redirect URLs'e aynı domain ekle

### 4. Test Kullanıcısı
- Supabase → Authentication → Users → Invite user
- `firms` tablosuna bu kullanıcı için kayıt ekle

### 5. Meta Webhook Kaydı
- Meta Developer Console → App → WhatsApp → Configuration
- Callback URL: `https://[n8n-url]/webhook/whatsapp`
- Verify Token: WF-001'deki token ile eşleşmeli
- Subscribe: `messages` event'i

---

## Bilinen Sorunlar / Notlar

1. **WF-001 "Build AI Prompt" node** — Get Products, Get FAQs, Get History çıktıları bu node'a index 0/1/2 ile bağlı. Code node'un tek input portu var ama `$('node_name')` referansları direkt çalışır. Runtime'da test edilmeli.

2. **respondToWebhook `responseCode`** — `Return Challenge` ve `Respond 200 OK` node'larında `responseCode: 200` hem üst seviyede hem `options` içinde tanımlı. Fazlalık ama işlevsel sorun yaratmıyor.

3. **Dashboard route değişikliği** — Vercel'deki mevcut deployment `(dashboard)` route group'u kullanıyor olabilir. Yeni deploy sonrası URL'lerin `/dashboard/` prefix'i aldığını doğrula.

4. **n8n `$vars` erişimi** — `$vars.VARIABLE_NAME` syntax'ı sadece n8n Variables (Settings → Variables) ile çalışır. Credential store ile çalışmaz. Tüm değişkenlerin Settings → Variables'a girilmesi şart.

---

## Proje Dosya Yapısı

```
demars-crm/
├── dashboard/                    # Next.js 14 App
│   ├── app/
│   │   ├── (auth)/              # Login sayfaları
│   │   ├── auth/                # Supabase auth callback
│   │   └── dashboard/           # Ana dashboard sayfaları
│   │       ├── page.tsx         # Ana panel
│   │       ├── layout.tsx       # Sidebar layout
│   │       ├── conversations/
│   │       ├── orders/
│   │       ├── notifications/
│   │       └── settings/
│   └── ...
├── n8n/
│   └── workflows/
│       ├── WF-001-main-message-handler.json       # ✅ Import sorunu çözüldü
│       ├── WF-001-main-message-handler-fixed.json # Referans kopya
│       ├── WF-001-env-setup.md                    # Variable kurulum rehberi (import edilmez)
│       ├── WF-002-iban-order-flow.json            # ✅
│       ├── WF-003-receipt-analysis.json           # ✅
│       └── WF-005-firm-notifications.json         # ✅
├── supabase/
│   └── migrations/              # SQL migration dosyaları (001-003 + fixler)
├── doc/
│   ├── PROJECT_STATUS.md        # Bu dosya
│   ├── Faz1_PRD_v1.docx
│   └── proje_yol_haritasi.docx
└── .gitignore
```

---

## Git & PR Akışı

```bash
# Yeni özellik için:
git checkout develop
git checkout -b feature/özellik-adı
# ... geliştirme ...
git push origin feature/özellik-adı
# GitHub'da develop'a PR aç

# Release için:
# develop → master PR aç
```

**Mevcut branch'ler:**
- `master` — production
- `develop` — entegrasyon
- `feature/n8n-workflow-integration` — aktif (n8n aktivasyonu)
