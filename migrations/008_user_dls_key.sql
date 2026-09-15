ALTER TABLE users ADD COLUMN dls_user_key TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_dls_user_key
  ON users (dls_user_key);

UPDATE users
SET dls_user_key = (
  SELECT dls_user_key
  FROM fcm_tokens
  WHERE fcm_tokens.user_id = users.id
    AND fcm_tokens.dls_user_key IS NOT NULL
    AND fcm_tokens.dls_user_key <> ''
  ORDER BY fcm_tokens.updated_at DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM fcm_tokens
  WHERE fcm_tokens.user_id = users.id
    AND fcm_tokens.dls_user_key IS NOT NULL
    AND fcm_tokens.dls_user_key <> ''
);
