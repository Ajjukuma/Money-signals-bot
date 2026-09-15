/** SQLite schema (better-sqlite3). */

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(platform, platform_user_id)
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  tier TEXT NOT NULL DEFAULT 'free',
  expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  day_key TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referrals (
  code TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  uses INTEGER NOT NULL DEFAULT 0,
  bonus_days INTEGER NOT NULL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  code TEXT NOT NULL,
  redeemer_user_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (code, redeemer_user_id)
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  side TEXT NOT NULL,
  entry REAL NOT NULL,
  stop_loss REAL,
  take_profit TEXT,
  confidence REAL,
  note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  is_major INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_events (
  idempotency_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  user_id TEXT,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
`;
