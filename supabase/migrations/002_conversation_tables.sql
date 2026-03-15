-- conversations: 60 dakikalık oturum pencereleri
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state           TEXT NOT NULL DEFAULT 'active'
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
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
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
  customer_id          UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id      UUID REFERENCES conversations(id),
  order_number         TEXT DEFAULT
                       'ORD-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  product_details      JSONB DEFAULT '{}',
  delivery_address     TEXT,
  status               TEXT DEFAULT 'draft'
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
