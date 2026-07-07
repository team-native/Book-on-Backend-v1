import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

type QueryResult<T> = [T, unknown[]];
type SQLiteValue = string | number | bigint | Buffer | null;

const databasePath = path.resolve(env.sqlite.path);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

let database: DatabaseSync | undefined;
let transactionDepth = 0;

const getDatabase = () => {
  if (!database) {
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
  }
  return database;
};

const normalizeValue = (value: unknown): SQLiteValue => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  if (value === undefined) {
    return null;
  }
  return String(value);
};

const normalizeValues = (values: unknown[] = []) => values.map(normalizeValue);

const isReadQuery = (sql: string) => /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql);

const executeQuery = <T>(sql: string, values: unknown[] = []): QueryResult<T> => {
  const statement = getDatabase().prepare(sql);
  const params = normalizeValues(values);
  if (isReadQuery(sql)) {
    return [statement.all(...params) as T, []];
  }

  const result = statement.run(...params);
  return [{
    insertId: typeof result.lastInsertRowid === "bigint"
      ? Number(result.lastInsertRowid)
      : result.lastInsertRowid,
    affectedRows: result.changes,
    changedRows: result.changes
  } as T, []];
};

class SQLiteConnection {
  async query<T = unknown>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return executeQuery<T>(sql, values);
  }

  async exec(sql: string): Promise<void> {
    getDatabase().exec(sql);
  }

  async beginTransaction(): Promise<void> {
    if (transactionDepth === 0) {
      getDatabase().exec("BEGIN IMMEDIATE");
    }
    transactionDepth += 1;
  }

  async commit(): Promise<void> {
    transactionDepth = Math.max(0, transactionDepth - 1);
    if (transactionDepth === 0) {
      getDatabase().exec("COMMIT");
    }
  }

  async rollback(): Promise<void> {
    transactionDepth = Math.max(0, transactionDepth - 1);
    if (transactionDepth === 0) {
      getDatabase().exec("ROLLBACK");
    }
  }

  release() {}
}

export const pool = {
  async query<T = unknown>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return executeQuery<T>(sql, values);
  },

  async exec(sql: string): Promise<void> {
    getDatabase().exec(sql);
  },

  async getConnection(): Promise<SQLiteConnection> {
    return new SQLiteConnection();
  },

  async end(): Promise<void> {
    database?.close();
    database = undefined;
  }
};
