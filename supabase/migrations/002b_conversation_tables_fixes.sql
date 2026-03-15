-- Fix C1: Add ON DELETE CASCADE to customer_id FKs
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_customer_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_customer_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- Fix C2: Per-tenant order_number uniqueness (not global)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE orders ADD CONSTRAINT orders_order_number_firm_unique
  UNIQUE(firm_id, order_number);

-- Fix C3: conversations.state NOT NULL
ALTER TABLE conversations ALTER COLUMN state SET NOT NULL;

-- Fix I1: Dedup protection for inbound WhatsApp messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_message_id_dedup
  ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Fix I3: payment_amount must be positive when set
ALTER TABLE orders ADD CONSTRAINT orders_payment_amount_positive
  CHECK (payment_amount IS NULL OR payment_amount > 0);

-- Fix I5: Default order status is 'draft' (before IBAN is sent)
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'draft';
