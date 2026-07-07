import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool";
import { RowDataPacket } from "./types";

const run = async () => {
  await pool.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const directory = path.join(process.cwd(), "migrations");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT name FROM schema_migrations WHERE name = ?",
      [file]
    );

    if (rows.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(directory, file), "utf8");
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.exec(sql);
      await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      await connection.commit();
      console.log(`Applied ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await pool.end();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
