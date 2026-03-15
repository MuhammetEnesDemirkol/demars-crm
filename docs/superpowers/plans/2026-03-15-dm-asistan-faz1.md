# DM Asistan Faz 1 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Türkiye KOBİ'leri için multi-tenant WhatsApp AI müşteri iletişim platformunun (DM Asistan) Faz 1 MVP'sini inşa et — Supabase veritabanı şeması, 6 adet n8n otomasyon workflow'u ve Next.js firma sahibi dashboard'u dahil.

**Architecture:** Multi-tenant SaaS. Supabase (PostgreSQL + RLS + Auth) veri ve kimlik doğrulama katmanı. n8n (RepoCloud.io self-hosted) WhatsApp webhook işleme ve GPT-4o-mini/GPT-4o hibrit AI orkestrasyon. Her firma verisi Row Level Security ile tamamen izole. Sipariş akışı için conversation state Supabase'de tutulur (çoklu webhook çağrısı arası state korunur). Next.js 14 App Router dashboard Vercel'de host edilir.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL + Auth + Storage + Realtime), n8n (self-hosted), OpenAI API (GPT-4o + GPT-4o-mini), Meta WhatsApp Cloud API, Vercel

---

## Conversation State Machine (Kritik Mimari Kararı)

Her gelen mesajda WF-001 önce conversation state'i kontrol eder:

```
active            → Normal FAQ/ürün sorguları, intent classification
awaiting_address  → Sipariş başlatıldı, teslimat adresi bekleniyor
awaiting_payment  → IBAN gönderildi, dekont bekleniyor
summarized        → 60 dk inaktivite sonrası otomatik özetlendi
escalated         → İnsan devralma moduna geçildi
```

---

## Chunk 1: Database Foundation

### Task 1: Core Tables — firms, products, faqs, customers

**Files:**
- Create: `supabase/migrations/001_core_tables.sql`

- [ ] **Step 1: Migrations dizini oluştur**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Migration dosyasını yaz**

Create `supabase/migrations/001_core_tables.sql`:

```sql
-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- firms: Multi-tenant ana tablo
CREATE TABLE firms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  whatsapp_phone        TEXT NOT NULL,
  instagram_handle      TEXT,
  iban                  TEXT,
  iban_holder_name      TEXT,
  shipping_instructions TEXT,
  -- Meta WhatsApp Cloud API (gelen webhook'u firmaya bağlar)
  wa_phone_number_id    TEXT UNIQUE,
  wa_access_token       TEXT,
  wa_verify_token       TEXT DEFAULT gen_random_uuid()::TEXT,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- products: Firma ürün kataloğu
CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  price        DECIMAL(10,2),
  sizes        TEXT[] DEFAULT '{}',
  stock_status TEXT DEFAULT 'available'
               CHECK (stock_status IN ('available', 'out_of_stock', 'made_to_order')),
  category     TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- faqs: AI bilgi bankası
CREATE TABLE faqs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- customers: WhatsApp müşteri profilleri
CREATE TABLE customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  whatsapp_phone      TEXT NOT NULL,
  display_name        TEXT,
  ai_summary          TEXT,  -- AI tarafından üretilen müşteri özeti
  total_orders        INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(firm_id, whatsapp_phone)
);
```

- [ ] **Step 3: Migration'ı Supabase MCP ile uygula**

`execute_sql` aracını kullanarak migration SQL'ini çalıştır.

- [ ] **Step 4: Tabloların oluştuğunu doğrula**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```
Beklenen: firms, products, faqs, customers

---

### Task 2: Conversation & Order Tables

**Files:**
- Create: `supabase/migrations/002_conversation_tables.sql`

- [ ] **Step 1: Migration dosyasını yaz**

Create `supabase/migrations/002_conversation_tables.sql`:

```sql
-- conversations: 60 dakikalık oturum pencereleri
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  state           TEXT DEFAULT 'active'
                  CHECK (state IN (
                    'active',            -- Normal konuşma
                    'awaiting_address',  -- Sipariş başladı, adres bekleniyor
                    'awaiting_payment',  -- IBAN gönderildi, dekont bekleniyor
                    'summarized',        -- 60 dk inaktivite sonrası özetlendi
                    'escalated'          -- İnsan devralma
                  )),
  summary         TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- messages: Her mesaj kaydı
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'firm_owner')),
  content         TEXT NOT NULL,
  message_type    TEXT DEFAULT 'text'
                  CHECK (message_type IN ('text', 'image', 'document', 'audio')),
  media_url       TEXT,
  wa_message_id   TEXT,
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- orders: IBAN ödeme siparişleri
CREATE TABLE orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  customer_id          UUID NOT NULL REFERENCES customers(id),
  conversation_id      UUID REFERENCES conversations(id),
  order_number         TEXT UNIQUE DEFAULT
                       'ORD-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  product_details      JSONB DEFAULT '{}',   -- Serbest format sipariş detayı
  delivery_address     TEXT,
  status               TEXT DEFAULT 'pending_payment'
                       CHECK (status IN (
                         'draft', 'pending_payment', 'payment_received',
                         'processing', 'shipped', 'delivered', 'cancelled'
                       )),
  payment_method       TEXT DEFAULT 'iban' CHECK (payment_method IN ('iban', 'web')),
  payment_amount       DECIMAL(10,2),
  iban_sent_at         TIMESTAMPTZ,
  payment_received_at  TIMESTAMPTZ,
  receipt_url          TEXT,
  receipt_verified     BOOLEAN DEFAULT false,
  reminder_sent        BOOLEAN DEFAULT false,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- notifications: Firma sahibi bildirimleri
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  type       TEXT NOT NULL
             CHECK (type IN (
               'new_order', 'payment_received', 'new_message', 'escalation', 'reminder'
             )),
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB DEFAULT '{}',
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- [ ] **Step 2: Migration'ı uygula**
- [ ] **Step 3: Tüm 8 tablonun varlığını doğrula**

---

### Task 3: RLS Policies & Indexes

**Files:**
- Create: `supabase/migrations/003_rls_and_indexes.sql`

- [ ] **Step 1: Migration dosyasını yaz**

Create `supabase/migrations/003_rls_and_indexes.sql`:

```sql
-- Tüm tablolarda RLS aktif et
ALTER TABLE firms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- firms: Sadece sahibi görebilir
CREATE POLICY "firms_owner_policy" ON firms
  FOR ALL USING (owner_user_id = auth.uid());

-- Yardımcı fonksiyon: Mevcut kullanıcının firm_id'si
CREATE OR REPLACE FUNCTION get_user_firm_id()
RETURNS UUID AS $$
  SELECT id FROM firms WHERE owner_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Diğer tablolar: Sadece kendi firmasının verisini görebilir
CREATE POLICY "products_firm_policy"      ON products      FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "faqs_firm_policy"          ON faqs          FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "customers_firm_policy"     ON customers     FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "conversations_firm_policy" ON conversations FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "messages_firm_policy"      ON messages      FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "orders_firm_policy"        ON orders        FOR ALL USING (firm_id = get_user_firm_id());
CREATE POLICY "notifications_firm_policy" ON notifications FOR ALL USING (firm_id = get_user_firm_id());

-- NOT: n8n service_role key kullanır, RLS'yi bypass eder — ek policy gerekmez.

-- Performans indexleri
CREATE INDEX idx_firms_wa_phone_id          ON firms(wa_phone_number_id);
CREATE INDEX idx_customers_phone            ON customers(firm_id, whatsapp_phone);
CREATE INDEX idx_conversations_firm_state   ON conversations(firm_id, state);
CREATE INDEX idx_conversations_firm_time    ON conversations(firm_id, last_message_at DESC);
CREATE INDEX idx_messages_conversation      ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_firm_time         ON messages(firm_id, created_at DESC);
CREATE INDEX idx_orders_firm_status         ON orders(firm_id, status, created_at DESC);
CREATE INDEX idx_notifications_firm_unread  ON notifications(firm_id, is_read, created_at DESC);

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER firms_updated_at     BEFORE UPDATE ON firms     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER products_updated_at  BEFORE UPDATE ON products  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER orders_updated_at    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Migration'ı uygula**

- [ ] **Step 3: RLS'nin aktif olduğunu doğrula**

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;
```
Beklenen: Tüm 8 tablo için `rowsecurity = true`

---

## Chunk 2: n8n Workflows

n8n workflow'ları `n8n/workflows/` altında JSON dosyaları olarak saklanır.
Her dosya n8n UI'dan **Settings → Import from file** ile içe aktarılabilir.

**Kritik n8n konfigürasyonu:**
- Supabase bağlantısı: `service_role` key (RLS bypass eder)
- Supabase URL: `https://{PROJECT_REF}.supabase.co`
- WhatsApp API: `https://graph.facebook.com/v21.0`
- GPT-4o-mini: kısa mesajlar / intent classification
- GPT-4o: uzun yanıtlar / dekont analizi / kompleks sorular

**n8n ortam değişkenleri (n8n Settings → Variables):**
```
SUPABASE_URL       = https://xxxxx.supabase.co
SUPABASE_KEY       = service_role_key_here
OPENAI_API_KEY     = sk-...
```

---

### Task 4: WF-001 — Ana Mesaj İşleyici

**Files:**
- Create: `n8n/workflows/WF-001-main-message-handler.json`

Bu tüm WhatsApp mesajlarının giriş noktasıdır.

**Node sırası ve mantığı:**

```
[Webhook POST] → [Extract Message] → [Skip Check]
→ [Get Firm by phone_number_id] → [Firm Found?]
→ [Upsert Customer] → [Get/Create Conversation]
→ [Save Inbound Message] → [Update last_message_at]
→ [Route by Conversation State]
  ├─ awaiting_address → [Save as Address + Send IBAN] (WF-002 sub-flow)
  ├─ awaiting_payment + image → WF-003 sub-flow
  ├─ awaiting_payment + text → [Remind: Dekont gönder]
  └─ active → [Classify Intent (GPT-4o-mini)]
              → [Route by Intent]
                ├─ siparis_niyeti → WF-002 sub-flow
                └─ others → [Get Context] → [Get History]
                           → [Generate Response (GPT-4o/mini)]
                           → [Send WA Reply] → [Save Outbound Message]
```

**Node detayları:**

**1. Webhook Node**
- Method: POST + GET (aynı path)
- Path: `/webhook/whatsapp`
- Response: "Immediately" (Meta'ya hemen 200 dön)

**2. Webhook GET Handler (IF node)**
```javascript
// Meta webhook doğrulama isteği mi?
{{ $json.query['hub.verify_token'] !== undefined }}
// True → Respond with hub.challenge
// False → Devam et
```

**3. Extract Message (Code node)**
```javascript
const body = $input.item.json.body;
const entry = body?.entry?.[0];
const change = entry?.changes?.[0];
const value = change?.value;

if (!value?.messages?.[0]) {
  return [{ json: { skip: true } }];
}

const message = value.messages[0];
const contact = value.contacts?.[0];

return [{
  json: {
    phone_number_id: value.metadata.phone_number_id,
    customer_phone: message.from,
    customer_name: contact?.profile?.name || 'Müşteri',
    wa_message_id: message.id,
    message_type: message.type,
    message_text: message.text?.body || '',
    media_id: message.image?.id || message.document?.id || null,
    timestamp: message.timestamp
  }
}];
```

**4. Get Firm (HTTP Request)**
```
GET {{ $env.SUPABASE_URL }}/rest/v1/firms
  ?wa_phone_number_id=eq.{{ $json.phone_number_id }}
  &select=id,name,iban,iban_holder_name,wa_access_token,wa_phone_number_id,whatsapp_phone
Headers:
  apikey: {{ $env.SUPABASE_KEY }}
  Authorization: Bearer {{ $env.SUPABASE_KEY }}
```

**5. Upsert Customer (HTTP Request)**
```
POST {{ $env.SUPABASE_URL }}/rest/v1/customers
Headers:
  Prefer: resolution=merge-duplicates,return=representation
Body: {
  "firm_id": "{{ $json.firm_id }}",
  "whatsapp_phone": "{{ $json.customer_phone }}",
  "display_name": "{{ $json.customer_name }}",
  "last_interaction_at": "{{ $now }}"
}
```

**6. Get Active Conversation (HTTP Request)**
```
GET {{ $env.SUPABASE_URL }}/rest/v1/conversations
  ?firm_id=eq.{{ $json.firm_id }}
  &customer_id=eq.{{ $json.customer_id }}
  &state=in.(active,awaiting_address,awaiting_payment)
  &last_message_at=gte.{{ $now - 3600 seconds }}
  &order=last_message_at.desc
  &limit=1
```
Sonuç boşsa: POST ile yeni conversation yarat (`state: 'active'`)

**7. Intent Classification (OpenAI node, GPT-4o-mini)**

System prompt:
```
Sen bir Türk KOBİ asistan yöneticisisin. Müşteri mesajını analiz et.
Yalnızca şu seçeneklerden birini döndür (başka hiçbir şey yazma):
- siparis_niyeti (ürün satın almak istiyor)
- fiyat_sorusu (fiyat/ücret soruyor)
- stok_sorusu (stok/beden/renk soruyor)
- kargo_sorusu (kargo/teslimat/süre soruyor)
- genel_soru (diğer konular)
- selamlama (merhaba, selam vb.)
```

**8. AI Response (OpenAI node, GPT-4o veya GPT-4o-mini)**

Mesaj uzunluğuna göre model seç (Code node):
```javascript
const msgLength = $json.message_text.length;
return [{ json: { model: msgLength > 100 ? 'gpt-4o' : 'gpt-4o-mini' } }];
```

System prompt template:
```
Sen {{ firm.name }} adlı Türk işletmesinin WhatsApp asistanısın.
Müşterilere Türkçe, samimi ve kısa yanıtlar ver.

ÜRÜNLER:
{{ products | format }}

SIK SORULAN SORULAR:
{{ faqs | format }}

KARGO BİLGİSİ: {{ firm.shipping_instructions }}

Bilmediğin konularda: "Bu konuda size daha iyi yardımcı olmak için
sizi firma yetkilimize bağlıyorum" de ve escalate et.
```

**9. Send WhatsApp Reply (HTTP Request)**
```
POST https://graph.facebook.com/v21.0/{{ phone_number_id }}/messages
Headers:
  Authorization: Bearer {{ firm.wa_access_token }}
Body: {
  "messaging_product": "whatsapp",
  "to": "{{ customer_phone }}",
  "type": "text",
  "text": { "body": "{{ ai_response }}" }
}
```

- [ ] **Step 1: `n8n/workflows/WF-001-main-message-handler.json` oluştur ve n8n'e import et**
- [ ] **Step 2: n8n webhook URL'ini Meta Developer Console'a kaydet**
- [ ] **Step 3: Meta'nın "Send Test Message" özelliği ile test et**
- [ ] **Step 4: Firma bulunamama, müşteri yaratma, intent routing'i doğrula**

---

### Task 5: WF-002 — IBAN Sipariş Akışı

**Files:**
- Create: `n8n/workflows/WF-002-iban-order-flow.json`

WF-001'den sipariş niyeti veya `awaiting_address` state'inde tetiklenir.

**Case A: Sipariş niyeti (state = active)**

```
[Receive from WF-001]
→ [Extract Order Details (GPT-4o-mini)]
  System: "Müşteri mesajından sipariş detaylarını JSON olarak çıkar:
           { product_name, size, quantity, notes }
           Bilgi yoksa null döndür."
→ [Ask for Address (WA Message)]
  "Siparişinizi aldık! 🎉
   Teslimat adresinizi paylaşır mısınız?
   (İl, İlçe, Mahalle, Cadde/Sokak, Bina No, Daire No)"
→ [Update conversation state → awaiting_address]
→ [Create draft order in DB]
→ [Trigger WF-005: "Yeni sipariş niyeti: {{ customer_name }}"]
```

**Case B: Adres alındı (state = awaiting_address)**

```
[Receive from WF-001]
→ [Save address to order]
  PATCH /orders?conversation_id=eq.{{ conv_id }}&status=eq.draft
  Body: { "delivery_address": "{{ message_text }}", "status": "pending_payment" }
→ [Get firm IBAN]
→ [Send IBAN message]
  "Teşekkürler! Ödemenizi şu IBAN'a yapabilirsiniz:

   🏦 IBAN: {{ firm.iban }}
   👤 Ad Soyad: {{ firm.iban_holder_name }}
   📝 Açıklama: {{ order.order_number }}

   Ödeme dekontunuzu bu sohbete fotoğraf olarak göndermeniz yeterli. ✅"
→ [Update order: iban_sent_at = now(), status = pending_payment]
→ [Update conversation state → awaiting_payment]
→ [Trigger WF-005: "Yeni sipariş + adres alındı"]
→ [Schedule WF-006 check — order reminder_sent flag'ini bırak, WF-006 periyodik kontrol eder]
```

- [ ] **Step 1: JSON oluştur ve import et**
- [ ] **Step 2: Uçtan uca sipariş akışını test et**

---

### Task 6: WF-003 — Dekont Analizi

**Files:**
- Create: `n8n/workflows/WF-003-receipt-analysis.json`

`awaiting_payment` state'inde görsel mesaj geldiğinde WF-001'den tetiklenir.

```
[Receive: media_id, conversation_id, order, firm, customer]
→ [Get Media URL from WhatsApp]
  GET https://graph.facebook.com/v21.0/{{ media_id }}
  → Returns { url: "..." }
→ [Download Image Binary]
  GET {{ media_url }}
  Auth: Bearer {{ wa_access_token }}
→ [Upload to Supabase Storage]
  POST {{ SUPABASE_URL }}/storage/v1/object/receipts/{{ order_id }}/receipt.jpg
  → Returns public URL
→ [Analyze Receipt (GPT-4o Vision)]
  System: "Bu görseli analiz et. Bir ödeme dekontu mu?
           Eğer evet: { is_receipt: true, amount, sender, date, description }
           Değilse: { is_receipt: false }"
  Input: image URL
→ [Receipt Valid? (IF)]
  TRUE:
    → PATCH order: { status: 'payment_received', receipt_url, receipt_verified: true, payment_received_at: now }
    → Update conversation state → active
    → Send WA: "✅ Ödemenizi aldık! Siparişiniz hazırlanmaya başlandı.
                Sipariş No: {{ order.order_number }}"
    → Trigger WF-005: "💰 Ödeme alındı! {{ customer.display_name }}"
  FALSE:
    → Send WA: "Üzgünüm, bu görsel bir ödeme dekontu gibi görünmüyor.
                Lütfen banka uygulamanızdan aldığınız dekont ekran görüntüsünü
                paylaşır mısınız?"
```

- [ ] **Step 1: Supabase Storage'da "receipts" bucket oluştur (private)**
- [ ] **Step 2: JSON oluştur ve import et**
- [ ] **Step 3: Gerçek bir dekont görseli ile test et**

---

### Task 7: WF-004 — Konuşma Özetleyici

**Files:**
- Create: `n8n/workflows/WF-004-conversation-summary.json`

Her 5 dakikada bir çalışır, 60 dakika inaktif konuşmaları özetler.

```
[Schedule: every 5 minutes]
→ [Find Inactive Conversations]
  GET /conversations
    ?state=in.(active,awaiting_address)
    &last_message_at=lt.{{ now - 3600 seconds }}
    &select=id,customer_id,firm_id
→ [Loop over each]
  → [Get Full Message History]
    GET /messages?conversation_id=eq.{{ conv_id }}&order=created_at&select=sender_type,content,created_at
  → [Generate Summary (GPT-4o-mini)]
    System: "Bu WhatsApp konuşmasını Türkçe olarak kısaca özetle.
             Müşteri hakkında önemli bilgileri ve sipariş verdiyse
             belirt. Maksimum 3 cümle."
    Input: Formatlanmış mesaj listesi
  → [Update Conversation]
    PATCH /conversations?id=eq.{{ conv_id }}
    { "state": "summarized", "summary": "{{ ai_summary }}", "ended_at": "{{ now }}" }
  → [Update Customer ai_summary]
    PATCH /customers?id=eq.{{ customer_id }}
    { "ai_summary": "{{ ai_summary }}" }
```

- [ ] **Step 1: JSON oluştur ve import et**
- [ ] **Step 2: Activate et ve 5 dk sonra çalıştığını doğrula**
- [ ] **Step 3: Test: 60 dk öncesi tarihli bir conversation yarat, özetlendiğini kontrol et**

---

### Task 8: WF-005 — Firma Sahibi Bildirimleri

**Files:**
- Create: `n8n/workflows/WF-005-firm-notifications.json`

Diğer workflow'lardan çağrılan sub-workflow.

```
[Webhook Trigger]
  Input: { firm_id, type, title, body, data }
→ [Save Notification to DB]
  POST /notifications
  { firm_id, type, title, body, data }
→ [Get Firm Owner Phone]
  GET /firms?id=eq.{{ firm_id }}&select=whatsapp_phone,wa_phone_number_id,wa_access_token
→ [Send WA to Firm Owner]
  POST https://graph.facebook.com/v21.0/{{ phone_number_id }}/messages
  Body: {
    "messaging_product": "whatsapp",
    "to": "{{ firm.whatsapp_phone }}",
    "type": "text",
    "text": { "body": "🔔 {{ title }}\n\n{{ body }}" }
  }
```

- [ ] **Step 1: JSON oluştur ve import et**
- [ ] **Step 2: Manuel webhook trigger ile test et**

---

### Task 9: WF-006 — Ödeme Hatırlatıcı

**Files:**
- Create: `n8n/workflows/WF-006-payment-reminder.json`

Her 15 dakikada bir çalışır. IBAN gönderilmiş 2+ saattir ödeme gelmeyen siparişlere hatırlatma gönderir.

```
[Schedule: every 15 minutes]
→ [Find Orders Needing Reminder]
  GET /orders
    ?status=eq.pending_payment
    &reminder_sent=eq.false
    &iban_sent_at=lt.{{ now - 7200 seconds }}
    &select=id,order_number,customer_id,conversation_id,firm_id
→ [Loop over each]
  → [Get Customer Phone]
    GET /customers?id=eq.{{ customer_id }}&select=whatsapp_phone
  → [Get Firm IBAN]
    GET /firms?id=eq.{{ firm_id }}&select=iban,iban_holder_name,wa_phone_number_id,wa_access_token
  → [Send Reminder]
    "Merhaba! {{ order.order_number }} numaralı siparişiniz için
     ödeme bildirimini henüz almadık.

     🏦 IBAN: {{ firm.iban }}
     👤 Ad: {{ firm.iban_holder_name }}

     Ödeme yaptıysanız dekontunuzu paylaşabilirsiniz. 🙏"
  → [Mark reminder_sent = true]
    PATCH /orders?id=eq.{{ order_id }}
    { "reminder_sent": true }
```

- [ ] **Step 1: JSON oluştur ve import et**
- [ ] **Step 2: Activate et**
- [ ] **Step 3: Test: Manuel olarak `iban_sent_at` 3 saat öncesi olan bir order yarat, hatırlatmanın gittiğini kontrol et**

---

## Chunk 3: Next.js Dashboard

### Task 10: Proje Kurulumu

**Files:**
- Create: `dashboard/` (Next.js 14 App Router projesi)
- Create: `dashboard/.env.local`
- Create: `dashboard/lib/supabase/client.ts`
- Create: `dashboard/lib/supabase/server.ts`
- Create: `dashboard/lib/types/database.ts`

- [ ] **Step 1: Next.js projesi oluştur**

```bash
cd /c/Users/muham/OneDrive/Desktop/Projeler/demars-crm
npx create-next-app@latest dashboard \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias="@/*"
```

- [ ] **Step 2: Bağımlılıkları kur**

```bash
cd dashboard
npm install @supabase/supabase-js @supabase/ssr lucide-react date-fns
npx shadcn@latest init
npx shadcn@latest add button card badge table input label textarea \
  select dialog alert skeleton tabs separator
```

shadcn init cevapları: style=default, baseColor=slate, cssVariables=yes

- [ ] **Step 3: `.env.local` oluştur**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

- [ ] **Step 4: Supabase browser client**

Create `dashboard/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/lib/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Supabase server client**

Create `dashboard/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

- [ ] **Step 6: TypeScript tipler üret**

```bash
npx supabase gen types typescript \
  --project-id YOUR_SUPABASE_PROJECT_ID \
  > lib/types/database.ts
```

- [ ] **Step 7: Projenin çalıştığını doğrula**

```bash
npm run dev
```
Beklenen: http://localhost:3000 açılıyor

---

### Task 11: Authentication

**Files:**
- Create: `dashboard/middleware.ts`
- Create: `dashboard/app/(auth)/login/page.tsx`
- Create: `dashboard/app/(auth)/layout.tsx`
- Create: `dashboard/app/auth/callback/route.ts`

- [ ] **Step 1: Auth callback route**

Create `dashboard/app/auth/callback/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

- [ ] **Step 2: Middleware**

Create `dashboard/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
```

- [ ] **Step 3: Login sayfası**

Create `dashboard/app/(auth)/login/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Giriş başarısız. Email veya şifrenizi kontrol edin.')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">DM Asistan</CardTitle>
          <CardDescription>Firma Paneli Girişi</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password" type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Auth layout**

Create `dashboard/app/(auth)/layout.tsx`:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 5: Test: Supabase'de test user yarat, login yap, dashboard'a yönlendirildiğini doğrula**

---

### Task 12: Dashboard Layout & Genel Bakış

**Files:**
- Create: `dashboard/components/sidebar.tsx`
- Create: `dashboard/app/(dashboard)/layout.tsx`
- Create: `dashboard/app/(dashboard)/page.tsx`

- [ ] **Step 1: Sidebar component**

Create `dashboard/components/sidebar.tsx`:
```typescript
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, MessageSquare, ShoppingBag, Bell, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',              label: 'Genel Bakış',   icon: LayoutDashboard },
  { href: '/dashboard/conversations',label: 'Konuşmalar',    icon: MessageSquare   },
  { href: '/dashboard/orders',       label: 'Siparişler',    icon: ShoppingBag     },
  { href: '/dashboard/notifications',label: 'Bildirimler',   icon: Bell            },
  { href: '/dashboard/settings',     label: 'Ayarlar',       icon: Settings        },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-64 bg-white border-r flex flex-col h-full">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold">DM Asistan</h1>
        <p className="text-xs text-slate-500 mt-1">Firma Paneli</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t">
        <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Dashboard layout**

Create `dashboard/app/(dashboard)/layout.tsx`:
```typescript
import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Genel bakış (overview) sayfası**

Create `dashboard/app/(dashboard)/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, ShoppingBag, Bell, Users } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: firm } = await supabase.from('firms').select('*').single()

  const [
    { count: totalOrders },
    { count: pendingOrders },
    { count: unreadNotifs },
    { count: activeConvs },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true })
      .eq('status', 'pending_payment'),
    supabase.from('notifications').select('*', { count: 'exact', head: true })
      .eq('is_read', false),
    supabase.from('conversations').select('*', { count: 'exact', head: true })
      .in('state', ['active', 'awaiting_address', 'awaiting_payment']),
  ])

  const stats = [
    { label: 'Toplam Sipariş',    value: totalOrders   || 0, icon: ShoppingBag,  color: 'text-blue-600'  },
    { label: 'Ödeme Bekleniyor',  value: pendingOrders  || 0, icon: ShoppingBag,  color: 'text-yellow-600'},
    { label: 'Aktif Konuşma',     value: activeConvs    || 0, icon: MessageSquare, color: 'text-green-600' },
    { label: 'Okunmamış Bildirim',value: unreadNotifs   || 0, icon: Bell,          color: 'text-orange-600'},
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Hoş geldiniz, {firm?.name || 'Firma'}
        </h1>
        <p className="text-slate-500 mt-1">Günlük aktivite özeti</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Dashboard'un gerçek verilerle çalıştığını doğrula**

---

### Task 13: Konuşmalar Sayfası

**Files:**
- Create: `dashboard/app/(dashboard)/conversations/page.tsx`
- Create: `dashboard/app/(dashboard)/conversations/[id]/page.tsx`

- [ ] **Step 1: Konuşma listesi sayfası**

Create `dashboard/app/(dashboard)/conversations/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import Link from 'next/link'

const stateConfig: Record<string, { label: string; className: string }> = {
  active:           { label: 'Aktif',             className: 'bg-green-50 text-green-700'  },
  awaiting_address: { label: 'Adres Bekleniyor',  className: 'bg-yellow-50 text-yellow-700'},
  awaiting_payment: { label: 'Ödeme Bekleniyor',  className: 'bg-blue-50 text-blue-700'   },
  summarized:       { label: 'Tamamlandı',         className: 'bg-slate-50 text-slate-600' },
  escalated:        { label: 'Devredildi',         className: 'bg-red-50 text-red-700'    },
}

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, customers(display_name, whatsapp_phone)')
    .order('last_message_at', { ascending: false })
    .limit(100)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Konuşmalar</h1>
      <div className="space-y-2">
        {conversations?.map(conv => {
          const customer = conv.customers as any
          const state = stateConfig[conv.state] || stateConfig.active
          return (
            <Link key={conv.id} href={`/dashboard/conversations/${conv.id}`}>
              <div className="bg-white rounded-xl border p-4 hover:border-slate-300 transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{customer?.display_name || 'Müşteri'}</p>
                    <p className="text-xs text-slate-400">{customer?.whatsapp_phone}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${state.className}`}>
                      {state.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: tr })}
                    </span>
                  </div>
                </div>
                {conv.summary && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{conv.summary}</p>
                )}
              </div>
            </Link>
          )
        })}
        {!conversations?.length && (
          <div className="text-center py-16 text-slate-400">Henüz konuşma yok</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Konuşma detay sayfası**

Create `dashboard/app/(dashboard)/conversations/[id]/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase.from('conversations')
      .select('*, customers(display_name, whatsapp_phone)')
      .eq('id', id).single(),
    supabase.from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at'),
  ])

  if (!conversation) notFound()

  const customer = conversation.customers as any

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">{customer?.display_name || 'Müşteri'}</h1>
        <p className="text-slate-500 text-sm">{customer?.whatsapp_phone}</p>
      </div>

      {conversation.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-900">
          <strong>Özet:</strong> {conversation.summary}
        </div>
      )}

      <div className="space-y-2">
        {messages?.map(msg => (
          <div
            key={msg.id}
            className={cn('flex', msg.direction === 'inbound' ? 'justify-start' : 'justify-end')}
          >
            <div className={cn(
              'max-w-sm px-4 py-2 rounded-2xl text-sm',
              msg.direction === 'inbound'
                ? 'bg-white border text-slate-900'
                : msg.sender_type === 'ai'
                  ? 'bg-slate-800 text-white'
                  : 'bg-blue-600 text-white'
            )}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={cn(
                'text-xs mt-1',
                msg.direction === 'inbound' ? 'text-slate-400' : 'text-white/60'
              )}>
                {format(new Date(msg.created_at), 'HH:mm', { locale: tr })}
                {msg.sender_type === 'ai' && ' · AI'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Konuşma listesi ve detay çalışıyor mu doğrula**

---

### Task 14: Siparişler Sayfası

**Files:**
- Create: `dashboard/app/(dashboard)/orders/page.tsx`

- [ ] **Step 1: Siparişler sayfası**

Create `dashboard/app/(dashboard)/orders/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

const statusConfig: Record<string, { label: string; className: string }> = {
  draft:            { label: 'Taslak',           className: 'bg-slate-50 text-slate-600'   },
  pending_payment:  { label: 'Ödeme Bekleniyor', className: 'bg-yellow-50 text-yellow-700' },
  payment_received: { label: 'Ödeme Alındı',     className: 'bg-green-50 text-green-700'   },
  processing:       { label: 'Hazırlanıyor',     className: 'bg-blue-50 text-blue-700'     },
  shipped:          { label: 'Kargoda',          className: 'bg-purple-50 text-purple-700' },
  delivered:        { label: 'Teslim Edildi',    className: 'bg-slate-50 text-slate-500'   },
  cancelled:        { label: 'İptal',            className: 'bg-red-50 text-red-700'       },
}

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, customers(display_name, whatsapp_phone)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Siparişler</h1>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              {['Sipariş No', 'Müşteri', 'Ürün', 'Durum', 'Tutar', 'Tarih'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {orders?.map(order => {
              const customer = order.customers as any
              const status = statusConfig[order.status] || statusConfig.pending_payment
              const productName = (order.product_details as any)?.product_name || '-'
              return (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{order.order_number}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{customer?.display_name || '-'}</p>
                    <p className="text-xs text-slate-400">{customer?.whatsapp_phone}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{productName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {order.payment_amount ? `₺${Number(order.payment_amount).toLocaleString('tr-TR')}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {format(new Date(order.created_at), 'd MMM, HH:mm', { locale: tr })}
                  </td>
                </tr>
              )
            })}
            {!orders?.length && (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400">Henüz sipariş yok</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Siparişler sayfasını test et**

---

### Task 15: Ayarlar Sayfaları

**Files:**
- Create: `dashboard/app/(dashboard)/settings/page.tsx`
- Create: `dashboard/app/(dashboard)/settings/products/page.tsx`
- Create: `dashboard/app/(dashboard)/settings/faqs/page.tsx`

- [ ] **Step 1: Firma ayarları sayfası**

Create `dashboard/app/(dashboard)/settings/page.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  const [firm, setFirm] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('firms').select('*').single().then(({ data }) => setFirm(data))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('firms').update({
      name: firm.name,
      iban: firm.iban,
      iban_holder_name: firm.iban_holder_name,
      shipping_instructions: firm.shipping_instructions,
    }).eq('id', firm.id)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!firm) return <div className="animate-pulse text-slate-400">Yükleniyor...</div>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Firma Ayarları</h1>
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Firma Bilgileri</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>Firma Adı</Label>
              <Input
                value={firm.name || ''}
                onChange={e => setFirm({ ...firm, name: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ödeme Bilgileri (IBAN)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input
                value={firm.iban || ''}
                onChange={e => setFirm({ ...firm, iban: e.target.value })}
                placeholder="TR..."
              />
            </div>
            <div className="space-y-1">
              <Label>IBAN Ad Soyad</Label>
              <Input
                value={firm.iban_holder_name || ''}
                onChange={e => setFirm({ ...firm, iban_holder_name: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Kargo & Teslimat Bilgisi</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={firm.shipping_instructions || ''}
              onChange={e => setFirm({ ...firm, shipping_instructions: e.target.value })}
              placeholder="Kargo firması, teslimat süresi, ücretsiz kargo limiti vb."
              rows={4}
            />
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saved ? '✓ Kaydedildi' : saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Ürünler CRUD sayfası**

Create `dashboard/app/(dashboard)/settings/products/page.tsx`:

Şu operasyonları destekler: Ürün listesi, yeni ürün ekleme (dialog), ürün düzenleme, aktif/pasif toggle.

```typescript
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Power } from 'lucide-react'

type Product = { id: string; name: string; description: string; price: number; sizes: string[]; stock_status: string; category: string; is_active: boolean }

const emptyProduct = { name: '', description: '', price: 0, sizes: [], stock_status: 'available', category: '', is_active: true }

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [open, setOpen] = useState(false)
  const [firmId, setFirmId] = useState<string>('')

  const supabase = createClient()

  const load = async () => {
    const { data: firm } = await supabase.from('firms').select('id').single()
    if (firm) setFirmId(firm.id)
    const { data } = await supabase.from('products').select('*').order('created_at')
    setProducts(data || [])
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!editing) return
    if (editing.id) {
      await supabase.from('products').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('products').insert({ ...editing, firm_id: firmId })
    }
    setOpen(false)
    setEditing(null)
    load()
  }

  const toggleActive = async (product: Product) => {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    load()
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ürünler</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(emptyProduct)}>
              <Plus className="h-4 w-4 mr-2" /> Ürün Ekle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Ürün Düzenle' : 'Yeni Ürün'}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div><Label>Ürün Adı</Label><Input value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} /></div>
                <div><Label>Açıklama</Label><Textarea value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} rows={3} /></div>
                <div><Label>Fiyat (₺)</Label><Input type="number" value={editing.price || ''} onChange={e => setEditing({...editing, price: Number(e.target.value)})} /></div>
                <div><Label>Kategori</Label><Input value={editing.category || ''} onChange={e => setEditing({...editing, category: e.target.value})} /></div>
                <div>
                  <Label>Stok Durumu</Label>
                  <Select value={editing.stock_status || 'available'} onValueChange={v => setEditing({...editing, stock_status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Mevcut</SelectItem>
                      <SelectItem value="out_of_stock">Stok Yok</SelectItem>
                      <SelectItem value="made_to_order">Sipariş Üzerine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleSave}>Kaydet</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between ${!p.is_active ? 'opacity-50' : ''}`}>
            <div>
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-slate-500">{p.category} · {p.price ? `₺${p.price}` : 'Fiyat yok'} · {p.stock_status}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true) }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                <Power className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: SSS/FAQ CRUD sayfası**

Create `dashboard/app/(dashboard)/settings/faqs/page.tsx`:

Ürünler sayfasına benzer yapıda: soru/cevap listesi, ekleme/düzenleme/silme dialog.

- [ ] **Step 4: Ayarlar sayfaları çalışıyor mu doğrula**

---

### Task 16: Bildirimler Sayfası

**Files:**
- Create: `dashboard/app/(dashboard)/notifications/page.tsx`

- [ ] **Step 1: Bildirimler sayfası**

Create `dashboard/app/(dashboard)/notifications/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Bell, ShoppingBag, CreditCard, MessageSquare, AlertTriangle } from 'lucide-react'

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  new_order:        { icon: ShoppingBag,   color: 'text-blue-600',   bg: 'bg-blue-50'  },
  payment_received: { icon: CreditCard,    color: 'text-green-600',  bg: 'bg-green-50' },
  new_message:      { icon: MessageSquare, color: 'text-purple-600', bg: 'bg-purple-50'},
  escalation:       { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50'   },
  reminder:         { icon: Bell,          color: 'text-orange-600', bg: 'bg-orange-50'},
}

export default async function NotificationsPage() {
  const supabase = await createClient()

  // Sayfaya girildiğinde tüm bildirimleri okundu işaretle
  await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Bildirimler</h1>
      <div className="space-y-2">
        {notifications?.map(notif => {
          const config = typeConfig[notif.type] || typeConfig.new_message
          const Icon = config.icon
          return (
            <div key={notif.id} className="bg-white rounded-xl border p-4 flex items-start gap-4">
              <div className={`p-2 rounded-lg ${config.bg}`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{notif.title}</p>
                {notif.body && <p className="text-sm text-slate-500 mt-1">{notif.body}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: tr })}
                </p>
              </div>
            </div>
          )
        })}
        {!notifications?.length && (
          <div className="text-center py-16 text-slate-400">Henüz bildirim yok</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Bildirimler sayfasını test et**

---

### Task 17: Vercel Deployment

- [ ] **Step 1: GitHub reposu oluştur ve push et**

```bash
cd /c/Users/muham/OneDrive/Desktop/Projeler/demars-crm
git init
git add .
git commit -m "feat: DM Asistan Faz 1 MVP"
gh repo create demars-crm --private --push --source=.
```

- [ ] **Step 2: Vercel'e import et**
  - vercel.com → Add New Project → Import `demars-crm`
  - Root directory: `dashboard`

- [ ] **Step 3: Vercel ortam değişkenlerini ayarla**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 4: Deploy ve production build'in çalıştığını doğrula**

- [ ] **Step 5: Vercel production URL'ini Supabase Auth → URL Configuration'a ekle**
  - Site URL: `https://your-project.vercel.app`
  - Redirect URLs: `https://your-project.vercel.app/auth/callback`

---

## Uçtan Uca Test Senaryoları (Canlıya Geçiş Öncesi)

PRD'deki 12 test senaryosunun tamamı başarılı olmalı:

| # | Senaryo | Beklenen Sonuç |
|---|---------|----------------|
| T-01 | Müşteri ürün fiyatı soruyor | AI doğru fiyatı yanıtlıyor |
| T-02 | Müşteri beden/stok soruyor | AI stok durumunu yanıtlıyor |
| T-03 | "sipariş vermek istiyorum" | Adres soruluyor, conv state = awaiting_address |
| T-04 | Müşteri adres gönderiyor | IBAN gönderiliyor, order DB'ye kaydediliyor |
| T-05 | Müşteri gerçek dekont gönderiyor | Sipariş onaylanıyor, firma bilgilendiriliyor |
| T-06 | Müşteri geçersiz görsel gönderiyor | AI açıklayıcı hata mesajı gönderiyor |
| T-07 | 2 saat sonra ödeme gelmedi | Otomatik hatırlatma gönderiliyor |
| T-08 | Müşteri SSS soruyor | AI bilgi bankasından doğru cevap veriyor |
| T-09 | 60 dk inaktivite | Conversation DB'de summarized oluyor |
| T-10 | Yeni sipariş | Firma sahibi WA bildirimi alıyor |
| T-11 | Ödeme alındı | Firma sahibi WA bildirimi alıyor |
| T-12 | Eş zamanlı 3 müşteri | Her konuşma izole çalışıyor |

---

*Plan tarihi: 2026-03-15*
*Proje: DM Asistan Faz 1 MVP*
