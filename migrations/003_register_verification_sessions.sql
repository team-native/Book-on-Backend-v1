CREATE TABLE IF NOT EXISTS register_verification_sessions (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_register_verification_sessions_email
  ON register_verification_sessions (email, created_at);

CREATE INDEX IF NOT EXISTS idx_register_verification_sessions_expires_at
  ON register_verification_sessions (expires_at);
