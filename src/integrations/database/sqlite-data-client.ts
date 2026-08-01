/**
 * Minimal PostgREST-compatible client backed by Electron SQLite.
 * Supports the subset of PostgREST builder methods used by this app.
 */
import type { RestQueryFilter, RestQueryRequest } from "./rest-query-types";

export type { RestQueryRequest };

type Filter = RestQueryFilter;

type ThenableResult = { data: any; error: { message: string; code?: string } | null; count: number | null };

function getBridge() {
  const bridge = globalThis.window?.cynoplanning?.rest;
  if (!bridge) {
    throw new Error("SQLite data access requires the CynoPlanning Electron desktop app.");
  }
  return bridge;
}

class FilterBuilder implements PromiseLike<ThenableResult> {
  protected filters: Filter[] = [];
  protected orders: Array<{ column: string; ascending: boolean }> = [];
  protected limitValue?: number;
  protected offsetValue?: number;
  protected selectClause = "*";
  protected wantSingle = false;
  protected wantMaybeSingle = false;
  protected countMode?: "exact";
  protected headMode = false;
  protected returning = false;

  constructor(
    protected table: string,
    protected action: RestQueryRequest["action"] = "select",
    protected payload?: Record<string, unknown> | Record<string, unknown>[],
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.selectClause = columns;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = options.head;
    this.returning = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ type: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ type: "lt", column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ type: "gt", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ type: "ilike", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      this.filters.push({ type: "not", column, value, notType: "is" });
    } else if (operator === "eq") {
      this.filters.push({ type: "not", column, value, notType: "eq" });
    } else if (operator === "in") {
      this.filters.push({ type: "not", column, value, notType: "in" });
    } else {
      throw new Error(`Unsupported not operator: ${operator}`);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  protected buildRequest(): RestQueryRequest {
    return {
      table: this.table,
      action: this.action,
      select: this.selectClause,
      filters: this.filters,
      order: this.orders,
      limit: this.limitValue,
      offset: this.offsetValue,
      single: this.wantSingle,
      maybeSingle: this.wantMaybeSingle,
      count: this.countMode,
      head: this.headMode,
      payload: this.payload,
    };
  }

  then<TResult1 = ThenableResult, TResult2 = never>(
    onfulfilled?: ((value: ThenableResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    // Promise.resolve ensures sync throws from getBridge() become rejections
    // (otherwise an uncaught throw in then() can make button clicks look like no-ops).
    return Promise.resolve()
      .then(() => getBridge().query(this.buildRequest()))
      .then((value) => value as ThenableResult)
      .then(onfulfilled, onrejected);
  }
}

class TableBuilder {
  constructor(private table: string) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    const builder = new FilterBuilder(this.table, "select");
    return builder.select(columns, options);
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    return new FilterBuilder(this.table, "insert", payload);
  }

  update(payload: Record<string, unknown>) {
    return new FilterBuilder(this.table, "update", payload);
  }

  delete() {
    return new FilterBuilder(this.table, "delete");
  }
}

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(
    path: string,
    file: Blob | File | ArrayBuffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
  ) {
    const bytes =
      file instanceof Uint8Array
        ? file
        : file instanceof ArrayBuffer
          ? new Uint8Array(file)
          : new Uint8Array(await (file as Blob).arrayBuffer());
    const contentType =
      options?.contentType ??
      (typeof File !== "undefined" && file instanceof File ? file.type : "application/octet-stream");
    const result = await getBridge().storageUpload({
      bucket: this.bucket,
      path,
      dataBase64: BufferFrom(bytes),
      contentType,
      upsert: options?.upsert ?? false,
    });
    return { data: result.error ? null : { path }, error: result.error };
  }

  async remove(paths: string[]) {
    const result = await getBridge().storageRemove({ bucket: this.bucket, paths });
    return { data: result.error ? null : paths, error: result.error };
  }

  getPublicUrl(path: string) {
    return {
      data: {
        publicUrl: `cynoplanning-media://${this.bucket}/${path.replace(/^\/+/, "")}`,
      },
    };
  }

  async createSignedUrl(path: string, _expiresInSeconds?: number) {
    const publicUrl = `cynoplanning-media://${this.bucket}/${path.replace(/^\/+/, "")}`;
    return { data: { signedUrl: publicUrl }, error: null };
  }

  async download(path: string) {
    return getBridge().storageDownload({ bucket: this.bucket, path });
  }
}

function BufferFrom(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

class StorageApi {
  from(bucket: string) {
    return new StorageBucket(bucket);
  }
}

class AuthApi {
  async getSession() {
    const session = await globalThis.window?.cynoplanning?.auth?.getSession();
    if (!session) return { data: { session: null }, error: null };
    return {
      data: {
        session: {
          access_token: session.accessToken,
          expires_at: session.expiresAt ?? undefined,
          user: {
            id: session.user.id,
            email: session.user.email,
            user_metadata: { role: session.user.role },
          },
        },
      },
      error: null,
    };
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const session = await globalThis.window!.cynoplanning!.auth!.signIn(email, password);
      return {
        data: {
          session: {
            access_token: session.accessToken,
            expires_at: session.expiresAt ?? undefined,
            user: {
              id: session.user.id,
              email: session.user.email,
              user_metadata: { role: session.user.role },
            },
          },
          user: {
            id: session.user.id,
            email: session.user.email,
            user_metadata: { role: session.user.role },
          },
        },
        error: null,
      };
    } catch (error) {
      return {
        data: { session: null, user: null },
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async signUp() {
    return {
      data: { user: null, session: null },
      error: { message: "Account creation is disabled in local authentication mode." },
    };
  }

  async signOut() {
    await globalThis.window?.cynoplanning?.auth?.signOut();
    return { error: null };
  }

  onAuthStateChange() {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  async getClaims() {
    return { data: null, error: null };
  }
}

export type SqliteDataClient = {
  from(table: string): TableBuilder;
  storage: StorageApi;
  auth: AuthApi;
};

export function createSqliteDataClient(): SqliteDataClient {
  return {
    from: (table: string) => new TableBuilder(table),
    storage: new StorageApi(),
    auth: new AuthApi(),
  };
}
