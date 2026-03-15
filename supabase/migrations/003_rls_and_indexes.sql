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

-- NOTE: n8n service_role key kullanır, RLS'yi bypass eder — ek policy gerekmez.

-- Performans indexleri
CREATE INDEX idx_firms_wa_phone_id          ON firms(wa_phone_number_id);
CREATE INDEX idx_customers_phone            ON customers(firm_id, whatsapp_phone);
CREATE INDEX idx_conversations_firm_state   ON conversations(firm_id, state);
CREATE INDEX idx_conversations_firm_time    ON conversations(firm_id, last_message_at DESC);
CREATE INDEX idx_messages_conversation      ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_firm_time         ON messages(firm_id, created_at DESC);
CREATE INDEX idx_orders_firm_status         ON orders(firm_id, status, created_at DESC);
CREATE INDEX idx_notifications_firm_unread  ON notifications(firm_id, is_read, created_at DESC);
-- Additional indexes identified during review (S1 from code review of Task 1):
CREATE INDEX idx_products_firm_id           ON products(firm_id);
CREATE INDEX idx_faqs_firm_id               ON faqs(firm_id);

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
-- faqs now has updated_at (added in fix migration 001b)
CREATE TRIGGER faqs_updated_at      BEFORE UPDATE ON faqs      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Partial unique index: at most one active conversation per customer per firm
-- (prevents concurrent webhook race from creating two active sessions)
CREATE UNIQUE INDEX idx_conversations_one_active_per_customer
  ON conversations(firm_id, customer_id)
  WHERE state NOT IN ('summarized', 'escalated');

-- total_orders auto-increment trigger (maintains denormalized counter on customers)
CREATE OR REPLACE FUNCTION increment_customer_total_orders()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status != 'draft' THEN
    UPDATE customers SET total_orders = total_orders + 1 WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
      UPDATE customers SET total_orders = total_orders + 1 WHERE id = NEW.customer_id;
    ELSIF OLD.status != 'draft' AND NEW.status = 'cancelled' THEN
      UPDATE customers SET total_orders = GREATEST(total_orders - 1, 0) WHERE id = NEW.customer_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status != 'draft' AND OLD.status != 'cancelled' THEN
    UPDATE customers SET total_orders = GREATEST(total_orders - 1, 0) WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_total_count
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION increment_customer_total_orders();
