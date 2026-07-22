CREATE TABLE IF NOT EXISTS read365_sessions (
  user_id INTEGER NOT NULL PRIMARY KEY,
  read365_id TEXT NOT NULL,
  cookie_header TEXT NOT NULL,
  member_key TEXT NULL,
  school_key TEXT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  session_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_read365_sessions_expires_at
  ON read365_sessions (session_expires_at);
