import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const inputPath = path.resolve(process.argv[2] || "data/soma-catalog.ndjson");
const databasePath = path.resolve(process.env.SQLITE_PATH || "data/book-on.sqlite");

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");

const categoryNames = {
  0: "\ucd1d\ub958",
  1: "\ucca0\ud559",
  2: "\uc885\uad50",
  3: "\uc0ac\ud68c\uacfc\ud559",
  4: "\uc790\uc5f0\uacfc\ud559",
  5: "\uae30\uc220\uacfc\ud559",
  6: "\uc608\uc220",
  7: "\uc5b8\uc5b4",
  8: "\ubb38\ud559",
  9: "\uc5ed\uc0ac"
};

const missingTitle = "\uc81c\ubaa9 \uc5c6\uc74c";

const categoryStatement = database.prepare(`
  INSERT INTO dls_categories (code, name, source, updated_at)
  VALUES (?, ?, 'CALL_NO', CURRENT_TIMESTAMP)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    updated_at = CURRENT_TIMESTAMP
`);

const catalogStatement = database.prepare(`
  INSERT INTO dls_catalog_books (
    reg_code, title, author, publisher, pub_year, call_no,
    category_code, category_name, status, registered_at, raw_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(reg_code) DO UPDATE SET
    title = excluded.title,
    author = excluded.author,
    publisher = excluded.publisher,
    pub_year = excluded.pub_year,
    call_no = excluded.call_no,
    category_code = excluded.category_code,
    category_name = excluded.category_name,
    status = excluded.status,
    registered_at = excluded.registered_at,
    raw_json = excluded.raw_json,
    updated_at = CURRENT_TIMESTAMP
`);

const bookStatement = database.prepare(`
  INSERT INTO dls_books (
    reg_code, title, author, publisher, pub_year, isbn, call_no, class_no,
    category_code, category_name, cover_image_url, location_name, status,
    return_plan_date, holding_key, bib_key, raw_json, last_synced_at
  ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(reg_code) DO UPDATE SET
    title = COALESCE(dls_books.title, excluded.title),
    author = COALESCE(dls_books.author, excluded.author),
    publisher = COALESCE(dls_books.publisher, excluded.publisher),
    pub_year = COALESCE(dls_books.pub_year, excluded.pub_year),
    call_no = COALESCE(dls_books.call_no, excluded.call_no),
    category_code = COALESCE(dls_books.category_code, excluded.category_code),
    category_name = COALESCE(dls_books.category_name, excluded.category_name),
    status = COALESCE(dls_books.status, excluded.status)
`);

let count = 0;
database.exec("BEGIN IMMEDIATE");
try {
  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.categoryCode) {
      item.categoryName = categoryNames[item.categoryCode] || item.categoryName || null;
    }
    if (item.categoryCode && item.categoryName) {
      categoryStatement.run(item.categoryCode, item.categoryName);
    }

    catalogStatement.run(
      item.regCode,
      item.title || null,
      item.author || null,
      item.publisher || null,
      item.pubYear || null,
      item.callNo || null,
      item.categoryCode || null,
      item.categoryName || null,
      item.status || null,
      item.registeredAt || null,
      JSON.stringify(item)
    );

    bookStatement.run(
      item.regCode,
      item.title || missingTitle,
      item.author || null,
      item.publisher || null,
      item.pubYear || null,
      item.callNo || null,
      item.categoryCode || null,
      item.categoryName || null,
      item.status || null,
      JSON.stringify({
        reg_no: item.regCode,
        title: item.title || "",
        aut_nm: item.author || "",
        publisher: item.publisher || "",
        pblcn_yr: item.pubYear || "",
        call_no: item.callNo || "",
        status_desc: item.status || "",
        cover_img_path: null
      })
    );

    count += 1;
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

console.log(`Imported ${count} catalog rows into ${databasePath}`);
