-- Проверка cooldown внутри той же транзакции, а не только предварительным SELECT.
CREATE TRIGGER gang_cooldown BEFORE INSERT ON gang_members BEGIN
 SELECT CASE WHEN NEW.joined_at-(SELECT gang_changed_at FROM users WHERE id=NEW.user_id)<86400000 THEN RAISE(ABORT,'gang_cooldown') END;
END;
-- Журнал денежных операций — append-only.
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON wallet_ledger BEGIN
 SELECT RAISE(ABORT,'ledger_immutable');
END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON wallet_ledger BEGIN
 SELECT RAISE(ABORT,'ledger_immutable');
END;
