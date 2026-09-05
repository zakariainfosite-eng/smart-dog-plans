import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";
import { visibleRapportMessages } from "@/lib/rapport-message/permissions";
import { todayIsoDate } from "@/lib/rapport-message/format";
import type {
  RapportMessage,
  RapportMessageDraft,
  RapportMessageStorePayload,
} from "@/lib/rapport-message/types";
import { EMPTY_RAPPORT_MESSAGE_DRAFT, RAPPORT_MESSAGE_SETTINGS_KEY } from "@/lib/rapport-message/types";
import type { AuthUser } from "@/integrations/auth/types";

type SettingsRow = { id: string; key: string; value: unknown };

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseRapportMessage(value: unknown): RapportMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = asString(source.id).trim();
  if (!id) return null;
  return {
    id,
    title: asString(source.title),
    date: asString(source.date).slice(0, 10),
    recipient: asString(source.recipient),
    sender: asString(source.sender),
    reference: asString(source.reference),
    body: asString(source.body),
    signature: asString(source.signature),
    createdByUserId:
      typeof source.createdByUserId === "string" && source.createdByUserId.trim()
        ? source.createdByUserId
        : null,
    createdByEmail:
      typeof source.createdByEmail === "string" && source.createdByEmail.trim()
        ? source.createdByEmail
        : null,
    createdByName: asString(source.createdByName),
    createdAt: asString(source.createdAt) || nowIso(),
    updatedAt: asString(source.updatedAt) || nowIso(),
  };
}

export function parseRapportMessageStore(value: unknown): RapportMessageStorePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { documents: [] };
  }
  const source = value as Record<string, unknown>;
  const raw = Array.isArray(source.documents) ? source.documents : [];
  const documents: RapportMessage[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = parseRapportMessage(item);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    documents.push(parsed);
  }
  documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { documents };
}

export function createEmptyDraft(user: AuthUser | null | undefined): RapportMessageDraft {
  const sender = user?.email?.split("@")[0] ?? "";
  return {
    ...EMPTY_RAPPORT_MESSAGE_DRAFT,
    date: todayIsoDate(),
    sender,
    signature: sender,
  };
}

export function validateRapportMessageDraft(draft: RapportMessageDraft): string | null {
  const date = draft.date.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "date";
  return null;
}

async function findRow(db: DbClient): Promise<SettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", RAPPORT_MESSAGE_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SettingsRow | null) ?? null;
}

async function readStore(db: DbClient): Promise<{ row: SettingsRow | null; payload: RapportMessageStorePayload }> {
  const row = await findRow(db);
  return { row, payload: parseRapportMessageStore(row?.value) };
}

async function writeStore(
  db: DbClient,
  row: SettingsRow | null,
  payload: RapportMessageStorePayload,
): Promise<RapportMessageStorePayload> {
  const timestamp = nowIso();
  const value: RapportMessageStorePayload = {
    documents: payload.documents,
  };

  if (row) {
    const { error } = await db
      .from("application_settings")
      .update({
        value,
        updated_at: timestamp,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return value;
  }

  const { error } = await db.from("application_settings").insert({
    id: randomId(),
    key: RAPPORT_MESSAGE_SETTINGS_KEY,
    value,
    description: "Rapport / Message — administrative memos",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return value;
}

export async function fetchRapportMessages(
  db: DbClient,
  user: AuthUser | null | undefined,
): Promise<RapportMessage[]> {
  const { payload } = await readStore(db);
  return visibleRapportMessages(payload.documents, user);
}

export async function saveRapportMessage(
  db: DbClient,
  draft: RapportMessageDraft,
  user: AuthUser | null | undefined,
  existingId?: string | null,
): Promise<RapportMessage> {
  if (!user) throw new Error("Unauthenticated");
  const invalid = validateRapportMessageDraft(draft);
  if (invalid) throw new Error(invalid);

  const { row, payload } = await readStore(db);
  const timestamp = nowIso();
  const authorName = user.email.split("@")[0] || user.email;

  if (existingId) {
    const index = payload.documents.findIndex((item) => item.id === existingId);
    if (index < 0) throw new Error("not_found");
    const current = payload.documents[index];
    if (!visibleRapportMessages([current], user).length) throw new Error("forbidden");
    const updated: RapportMessage = {
      ...current,
      title: draft.title.trim(),
      date: draft.date.trim().slice(0, 10),
      recipient: draft.recipient.trim(),
      sender: draft.sender.trim(),
      reference: draft.reference.trim(),
      body: draft.body.replace(/\r\n/g, "\n").trim(),
      signature: draft.signature.trim(),
      updatedAt: timestamp,
    };
    const next = [...payload.documents];
    next[index] = updated;
    await writeStore(db, row, { documents: next });
    return updated;
  }

  const created: RapportMessage = {
    id: randomId(),
    title: draft.title.trim(),
    date: draft.date.trim().slice(0, 10),
    recipient: draft.recipient.trim(),
    sender: draft.sender.trim(),
    reference: draft.reference.trim(),
    body: draft.body.replace(/\r\n/g, "\n").trim(),
    signature: draft.signature.trim(),
    createdByUserId: user.id,
    createdByEmail: user.email,
    createdByName: authorName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeStore(db, row, { documents: [created, ...payload.documents] });
  return created;
}

export async function deleteRapportMessage(
  db: DbClient,
  id: string,
  user: AuthUser | null | undefined,
): Promise<void> {
  if (!user) throw new Error("Unauthenticated");
  const { row, payload } = await readStore(db);
  const current = payload.documents.find((item) => item.id === id);
  if (!current) return;
  if (!visibleRapportMessages([current], user).length) throw new Error("forbidden");
  await writeStore(db, row, {
    documents: payload.documents.filter((item) => item.id !== id),
  });
}
