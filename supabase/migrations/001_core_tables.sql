-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- firms: Multi-tenant ana tablo
CREATE TABLE firms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- customers: WhatsApp müşteri profilleri
CREATE TABLE customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  whatsapp_phone      TEXT NOT NULL,
  display_name        TEXT,
  ai_summary          TEXT,
  total_orders        INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(firm_id, whatsapp_phone)
);
