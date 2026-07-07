declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    all(...anonymousParameters: unknown[]): Array<Record<string, unknown>>;
    run(...anonymousParameters: unknown[]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }
}
