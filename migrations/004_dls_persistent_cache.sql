CREATE TABLE IF NOT EXISTS dls_categories (
  code TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'REG_CODE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dls_books (
  reg_code TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NULL,
  publisher TEXT NULL,
  pub_year TEXT NULL,
  isbn TEXT NULL,
  call_no TEXT NULL,
  class_no TEXT NULL,
  category_code TEXT NULL,
  category_name TEXT NULL,
  cover_image_url TEXT NULL,
  location_name TEXT NULL,
  status TEXT NULL,
  return_plan_date TEXT NULL,
  holding_key TEXT NULL,
  bib_key TEXT NULL,
  raw_json TEXT NOT NULL,
  first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_code) REFERENCES dls_categories (code)
);

CREATE TABLE IF NOT EXISTS dls_catalog_books (
  reg_code TEXT NOT NULL PRIMARY KEY,
  title TEXT NULL,
  author TEXT NULL,
  publisher TEXT NULL,
  pub_year TEXT NULL,
  call_no TEXT NULL,
  category_code TEXT NULL,
  category_name TEXT NULL,
  status TEXT NULL,
  registered_at TEXT NULL,
  source_file TEXT NOT NULL DEFAULT '소마고 도서목록-(7월8일).xls',
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_code) REFERENCES dls_categories (code)
);

CREATE INDEX IF NOT EXISTS idx_dls_catalog_books_category
  ON dls_catalog_books (category_code);

CREATE INDEX IF NOT EXISTS idx_dls_books_title
  ON dls_books (title);

CREATE INDEX IF NOT EXISTS idx_dls_books_category
  ON dls_books (category_code);

CREATE TABLE IF NOT EXISTS dls_users (
  user_key TEXT NOT NULL PRIMARY KEY,
  user_no TEXT NULL,
  name TEXT NOT NULL,
  user_class TEXT NULL,
  user_class_name TEXT NULL,
  school_name TEXT NULL,
  user_status TEXT NULL,
  loan_status TEXT NULL,
  raw_json TEXT NOT NULL,
  first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dls_users_user_no
  ON dls_users (user_no)
  WHERE user_no IS NOT NULL AND user_no <> '';

CREATE TABLE IF NOT EXISTS dls_current_loans (
  loan_key TEXT NOT NULL PRIMARY KEY,
  user_key TEXT NOT NULL,
  user_no TEXT NULL,
  reg_code TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NULL,
  publisher TEXT NULL,
  loan_date TEXT NULL,
  return_plan_date TEXT NULL,
  extend_count INTEGER NOT NULL DEFAULT 0,
  loan_status TEXT NULL,
  loan_status_desc TEXT NULL,
  raw_json TEXT NOT NULL,
  first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_key) REFERENCES dls_users (user_key),
  FOREIGN KEY (reg_code) REFERENCES dls_books (reg_code)
);

CREATE INDEX IF NOT EXISTS idx_dls_current_loans_user
  ON dls_current_loans (user_key);

CREATE TABLE IF NOT EXISTS dls_loan_histories (
  history_key TEXT NOT NULL PRIMARY KEY,
  loan_key TEXT NULL,
  user_key TEXT NOT NULL,
  reg_code TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NULL,
  publisher TEXT NULL,
  loan_date TEXT NULL,
  return_date TEXT NULL,
  return_plan_date TEXT NULL,
  loan_status TEXT NULL,
  raw_json TEXT NOT NULL,
  first_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_key) REFERENCES dls_users (user_key),
  FOREIGN KEY (reg_code) REFERENCES dls_books (reg_code)
);

CREATE INDEX IF NOT EXISTS idx_dls_loan_histories_user
  ON dls_loan_histories (user_key, loan_date);

INSERT INTO dls_categories (code, name, source) VALUES
  ('0', '총류', 'CALL_NO'),
  ('1', '철학', 'CALL_NO'),
  ('2', '종교', 'CALL_NO'),
  ('3', '사회과학', 'CALL_NO'),
  ('4', '자연과학', 'CALL_NO'),
  ('5', '기술과학', 'CALL_NO'),
  ('6', '예술', 'CALL_NO'),
  ('7', '언어', 'CALL_NO'),
  ('8', '문학', 'CALL_NO'),
  ('9', '역사', 'CALL_NO')
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  updated_at = CURRENT_TIMESTAMP;
