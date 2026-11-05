-- Общие раунды живут в SQLite Durable Objects. Каждая денежная ставка и её
-- окончательное решение — в D1. Триггеры входят в ТУ ЖЕ транзакцию, что и ставка.
CREATE TABLE live_casino_bets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 round_id TEXT NOT NULL,
 game TEXT NOT NULL CHECK(game IN ('roulette','crash')),
 stake INTEGER NOT NULL CHECK(stake>=10 AND stake<=1000 AND stake%2=0),
 choice TEXT,
 request_hash TEXT NOT NULL,
 placed_at INTEGER NOT NULL,
 closes_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','cashed_out','won','lost')),
 payout INTEGER NOT NULL DEFAULT 0 CHECK(payout>=0 AND payout<=stake*100),
 cashout_multiplier REAL,
 result TEXT,
 finished_at INTEGER,
 UNIQUE(user_id,round_id),
 CHECK((game='crash' AND choice IS NULL) OR (game='roulette' AND choice IS NOT NULL AND (choice IN ('red','black','zero') OR (CAST(choice AS INTEGER) BETWEEN 0 AND 36 AND CAST(CAST(choice AS INTEGER) AS TEXT)=choice))))
);
CREATE INDEX live_bets_round ON live_casino_bets(round_id,status);
CREATE INDEX live_bets_user ON live_casino_bets(user_id,game,placed_at DESC);
CREATE TRIGGER live_bet_deadline BEFORE INSERT ON live_casino_bets BEGIN
 SELECT CASE WHEN CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)>=NEW.closes_at THEN RAISE(ABORT,'bet_closed') END;
END;
CREATE TRIGGER live_bet_debit AFTER INSERT ON live_casino_bets BEGIN
 INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES('live-stake:'||NEW.id,NEW.user_id,-NEW.stake,'casino_stake',NEW.id,NEW.placed_at);
END;
CREATE TRIGGER live_bet_immutable BEFORE UPDATE ON live_casino_bets BEGIN
 SELECT CASE WHEN OLD.status!='accepted' OR NEW.id!=OLD.id OR NEW.user_id!=OLD.user_id OR NEW.round_id!=OLD.round_id OR NEW.game!=OLD.game OR NEW.stake!=OLD.stake OR NEW.choice IS NOT OLD.choice OR NEW.request_hash!=OLD.request_hash OR NEW.closes_at!=OLD.closes_at OR NEW.placed_at!=OLD.placed_at THEN RAISE(ABORT,'bet_immutable') END;
END;
CREATE TRIGGER live_bet_credit AFTER UPDATE OF status ON live_casino_bets WHEN OLD.status='accepted' AND NEW.status!='accepted' BEGIN
 INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES('live-payout:'||NEW.id,NEW.user_id,NEW.payout,'casino_payout',NEW.id,NEW.finished_at);
END;
