PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, telegram_id TEXT UNIQUE NOT NULL, username TEXT NOT NULL DEFAULT '',
 display_name TEXT NOT NULL, avatar_url TEXT, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
 gang_changed_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE wallets (user_id TEXT PRIMARY KEY REFERENCES users(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=1000000000));
CREATE TABLE wallet_ledger (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), delta INTEGER NOT NULL,
 reason TEXT NOT NULL, ref_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,reason,ref_id)
);
CREATE INDEX ledger_user ON wallet_ledger(user_id,created_at DESC);
-- Единственный путь изменения кошелька: вставка уникальной проводки.
-- CHECK в wallets откатывает ВСЮ транзакцию при недостатке денег.
CREATE TRIGGER ledger_apply AFTER INSERT ON wallet_ledger BEGIN
 UPDATE wallets SET balance=balance+NEW.delta WHERE user_id=NEW.user_id;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'wallet_missing') END;
END;
CREATE TABLE gangs (id TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), lifetime_xp INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE gang_members (gang_id TEXT NOT NULL REFERENCES gangs(id), user_id TEXT UNIQUE NOT NULL REFERENCES users(id), role TEXT NOT NULL, joined_at INTEGER NOT NULL, membership_id TEXT NOT NULL UNIQUE, PRIMARY KEY(gang_id,user_id));
CREATE TRIGGER gang_capacity BEFORE INSERT ON gang_members BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM gang_members WHERE gang_id=NEW.gang_id)>=20 THEN RAISE(ABORT,'gang_full') END;
END;
CREATE TABLE gang_invites (token TEXT PRIMARY KEY, gang_id TEXT NOT NULL REFERENCES gangs(id), expires_at INTEGER NOT NULL);
CREATE INDEX invites_expiry ON gang_invites(expires_at);
CREATE TABLE seasons (id INTEGER PRIMARY KEY, end_at INTEGER NOT NULL);
CREATE TABLE gang_member_scores (season_id INTEGER NOT NULL REFERENCES seasons(id), gang_id TEXT NOT NULL REFERENCES gangs(id), user_id TEXT NOT NULL REFERENCES users(id), membership_id TEXT NOT NULL, best_wave INTEGER NOT NULL, best_duration INTEGER NOT NULL, PRIMARY KEY(season_id,gang_id,user_id,membership_id));
CREATE TABLE runs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), seed INTEGER NOT NULL,
 gang_id_at_start TEXT, membership_id TEXT, season_id INTEGER NOT NULL,
 started_at INTEGER NOT NULL, ended_at INTEGER, status TEXT NOT NULL DEFAULT 'active',
 wave INTEGER NOT NULL DEFAULT 1, duration_seconds INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0,
 earned INTEGER NOT NULL DEFAULT 0, run_level INTEGER NOT NULL DEFAULT 1, verification_state TEXT NOT NULL DEFAULT 'pending',
 seq INTEGER NOT NULL DEFAULT 0, distance REAL NOT NULL DEFAULT 0, last_progress_at INTEGER NOT NULL,
 settlement_id TEXT, gang_xp INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_run ON runs(user_id) WHERE status='active';
CREATE INDEX run_user ON runs(user_id,started_at DESC);
CREATE INDEX run_top ON runs(verification_state,wave DESC,duration_seconds DESC);
CREATE INDEX run_expiry ON runs(status,last_progress_at);
CREATE TABLE run_checkpoints (run_id TEXT NOT NULL REFERENCES runs(id), seq INTEGER NOT NULL, received_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(run_id,seq));
CREATE TABLE casino_rounds (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), game_type TEXT NOT NULL,
 stake INTEGER NOT NULL CHECK(stake>=10 AND stake<=1000), status TEXT NOT NULL,
 state TEXT NOT NULL, request_hash TEXT NOT NULL, started_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, finished_at INTEGER, payout INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0, settlement_id TEXT
);
CREATE UNIQUE INDEX one_active_casino ON casino_rounds(user_id) WHERE status='active';
CREATE INDEX casino_user ON casino_rounds(user_id,started_at DESC);
CREATE INDEX casino_expiry ON casino_rounds(status,expires_at);
CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), job_type TEXT NOT NULL, started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, claimed_at INTEGER, claim_token TEXT);
CREATE UNIQUE INDEX one_job ON jobs(user_id) WHERE claimed_at IS NULL;
CREATE INDEX jobs_user ON jobs(user_id,started_at DESC);
CREATE TABLE owned_assets (user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL, purchased_at INTEGER NOT NULL, last_claim_at INTEGER NOT NULL, claim_token TEXT, PRIMARY KEY(user_id,item_id));
CREATE TABLE action_limits (user_id TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,bucket));
CREATE TABLE telegram_updates (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL);
