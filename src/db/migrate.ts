import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../config/env";

const run = async () => {
  const { database, connectionLimit: _connectionLimit, ...connectionConfig } = env.mysql;
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("MYSQL_DATABASE contains invalid characters");
  }

  const connection = await mysql.createConnection({
    ...connectionConfig,
    multipleStatements: true
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${database}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const directory = path.join(process.cwd(), "migrations");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT name FROM schema_migrations WHERE name = ?",
      [file]
    );

    if (rows.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      await connection.commit();
      console.log(`Applied ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  await connection.end();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
