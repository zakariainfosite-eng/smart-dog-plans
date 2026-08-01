/**
 * Main-process Supabase REST helpers for Phase 2 SQLite migration.
 * Uses PostgREST only (no Realtime / WebSocket).
 */

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export type SupabaseRestConfig = {
  url: string;
  key: string;
};

export function getSupabaseRestConfig(): SupabaseRestConfig {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  }

  const isServiceKey =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) ||
    Boolean(process.env.SUPABASE_SECRET_KEY?.trim()) ||
    key.startsWith("sb_secret_");

  if (!isServiceKey) {
    // Publishable/anon keys are subject to RLS and usually return 0 rows.
    throw new Error(
      "Phase 2 migration requires SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY / sb_secret_…). " +
        "The publishable key is blocked by RLS and cannot copy real data.",
    );
  }

  return { url: url.replace(/\/$/, ""), key };
}

function buildHeaders(key: string, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("Accept", "application/json");
  // Legacy JWT anon/service keys need Bearer; new sb_* keys must not send Bearer=apikey.
  if (!isNewSupabaseApiKey(key)) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  return headers;
}

/**
 * Paginated SELECT * from a public table via PostgREST.
 */
export async function fetchAllSupabaseRows(
  table: string,
  pageSize = 1000,
): Promise<Record<string, unknown>[]> {
  const { url, key } = getSupabaseRestConfig();
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=*`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildHeaders(key, {
        Range: `${from}-${to}`,
        Prefer: "count=exact",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to fetch ${table} from Supabase (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const batch = (await response.json()) as Record<string, unknown>[];
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected response for ${table}: expected JSON array`);
    }
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/** @deprecated Prefer fetchAllSupabaseRows — kept for callers that still import the client factory. */
export function createElectronSupabaseClient(): never {
  throw new Error(
    "createElectronSupabaseClient is deprecated for migration; use fetchAllSupabaseRows instead.",
  );
}
