/** Platform-independent SQLite executor used by Capacitor/iOS and browser runtimes. */

export type SqlRunResult = {
  changes: number;
};

export type SqlExecutor = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<SqlRunResult>;
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` inside a single SQLite transaction.
   * Nested calls join the outer transaction (no nested BEGIN);
   * only the outermost owner commits or rolls back.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
};
