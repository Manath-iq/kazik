-- Платежи поддержки намеренно не связаны с игровыми кошельками и наградами.
CREATE TABLE star_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), telegram_id TEXT NOT NULL,
 stars INTEGER NOT NULL CHECK(stars IN (25,100,250)), terms_version TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, invoice_url TEXT,
 checkout_query_id TEXT UNIQUE, checkout_until INTEGER NOT NULL DEFAULT 0,
 paid_charge_id TEXT UNIQUE
);
CREATE INDEX star_orders_user ON star_orders(user_id,created_at DESC);
CREATE TABLE star_payments (
 charge_id TEXT PRIMARY KEY, order_id TEXT REFERENCES star_orders(id), payer_telegram_id TEXT NOT NULL,
 invoice_payload TEXT NOT NULL, currency TEXT NOT NULL, stars INTEGER NOT NULL CHECK(stars>0),
 status TEXT NOT NULL CHECK(status IN ('paid','review','refund_pending','refunded')),
 received_at INTEGER NOT NULL, refunded_at INTEGER, refund_requested_at INTEGER
);
CREATE INDEX star_payments_payer ON star_payments(payer_telegram_id,received_at DESC);
CREATE TRIGGER star_order_identity BEFORE UPDATE OF user_id,telegram_id,stars,terms_version,created_at,expires_at ON star_orders BEGIN
 SELECT RAISE(ABORT,'star_order_immutable');
END;
CREATE TRIGGER star_payment_identity BEFORE UPDATE OF charge_id,order_id,payer_telegram_id,invoice_payload,currency,stars,received_at ON star_payments BEGIN
 SELECT RAISE(ABORT,'star_payment_immutable');
END;
CREATE TRIGGER star_refund_final BEFORE UPDATE OF status ON star_payments WHEN OLD.status='refunded' AND NEW.status!='refunded' BEGIN
 SELECT RAISE(ABORT,'star_refund_final');
END;
CREATE TRIGGER star_charge_consistency BEFORE INSERT ON star_payments WHEN EXISTS(SELECT 1 FROM star_payments WHERE charge_id=NEW.charge_id AND (payer_telegram_id!=NEW.payer_telegram_id OR invoice_payload!=NEW.invoice_payload OR currency!=NEW.currency OR stars!=NEW.stars)) BEGIN
 SELECT RAISE(ABORT,'star_charge_identity_mismatch');
END;
CREATE TRIGGER star_order_paid_once BEFORE UPDATE OF paid_charge_id ON star_orders WHEN OLD.paid_charge_id IS NOT NULL AND NEW.paid_charge_id IS NOT OLD.paid_charge_id BEGIN
 SELECT RAISE(ABORT,'star_order_already_paid');
END;
