/** Shared REST query types (renderer + Electron). */
export type RestQueryFilter = {
  type: "eq" | "neq" | "in" | "lte" | "gte" | "gt" | "lt" | "is" | "not" | "ilike";
  column: string;
  value?: unknown;
  notType?: "is" | "eq" | "in";
};

export type RestQueryRequest = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  select?: string;
  filters?: RestQueryFilter[];
  order?: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  offset?: number;
  single?: boolean;
  maybeSingle?: boolean;
  count?: "exact";
  head?: boolean;
  payload?: Record<string, unknown> | Record<string, unknown>[];
};

export type RestQueryResult = {
  data: any;
  error: { message: string; code?: string } | null;
  count: number | null;
};
