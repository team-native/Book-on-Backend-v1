ALTER TABLE users
  ADD COLUMN notice_reminder INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  dls_user_key TEXT NULL,
  platform TEXT NULL,
  device_id TEXT NULL,
  disabled_at TEXT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user
  ON fcm_tokens (user_id, disabled_at);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_dls_user
  ON fcm_tokens (dls_user_key, disabled_at);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  target_date TEXT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, kind, reference_type, reference_id, target_date),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_kind
  ON notification_deliveries (kind, reference_type, reference_id);
