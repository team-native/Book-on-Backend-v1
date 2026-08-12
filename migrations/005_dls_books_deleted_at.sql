ALTER TABLE dls_books ADD COLUMN deleted_at TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_dls_books_deleted_at
  ON dls_books (deleted_at);
