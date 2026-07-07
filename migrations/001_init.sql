CREATE TABLE IF NOT EXISTS users (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  password_hash TEXT NOT NULL,
  due_date_reminder INTEGER NOT NULL DEFAULT 1,
  new_book_reminder INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user
  ON password_reset_codes (user_id, created_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  library_number TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  cover_image_url TEXT NULL,
  total_quantity INTEGER NOT NULL DEFAULT 1 CHECK (total_quantity >= 0),
  registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE INDEX IF NOT EXISTS idx_books_title
  ON books (title);

CREATE INDEX IF NOT EXISTS idx_books_category
  ON books (category_id);

CREATE INDEX IF NOT EXISTS idx_books_registered_at
  ON books (registered_at);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  borrowed_at TEXT NOT NULL,
  due_date TEXT NOT NULL,
  returned_at TEXT NULL,
  status TEXT NOT NULL DEFAULT 'BORROWED' CHECK (status IN ('BORROWED', 'RETURNED', 'OVERDUE')),
  extension_count INTEGER NOT NULL DEFAULT 0 CHECK (extension_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (book_id) REFERENCES books (id)
);

CREATE INDEX IF NOT EXISTS idx_loans_user_status
  ON loans (user_id, status);

CREATE INDEX IF NOT EXISTS idx_loans_book_status
  ON loans (book_id, status);

CREATE INDEX IF NOT EXISTS idx_loans_borrowed_at
  ON loans (borrowed_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_book
  ON favorites (book_id);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notices_created_at
  ON notices (created_at);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  CHECK (active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_banners_active_order
  ON banners (active, display_order);

INSERT INTO categories (code, name) VALUES
  ('NOVEL', '소설'),
  ('SCIENCE', '과학'),
  ('HISTORY', '역사'),
  ('IT', 'IT'),
  ('ART', '예술'),
  ('SOCIETY', '사회')
ON CONFLICT(code) DO UPDATE SET name = excluded.name;
