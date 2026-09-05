import { format, parseISO } from "date-fns";

export function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatRapportMessageDate(value: string): string {
  const raw = value.trim().slice(0, 10);
  if (!raw) return "—";
  try {
    return format(parseISO(raw), "dd/MM/yyyy");
  } catch {
    return value.trim() || "—";
  }
}

export function splitBodyParagraphs(body: string): string[] {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => block.split("\n").map((line) => line.trimEnd()));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeRapportMessageFilenamePart(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return cleaned || "rapport";
}

export function rapportMessageExportBasename(input: {
  date: string;
  title: string;
}): string {
  const date = input.date.trim().slice(0, 10) || todayIsoDate();
  const title = sanitizeRapportMessageFilenamePart(input.title);
  return `Rapport-Message_${date}_${title}`;
}

export function displayUserName(email: string | null | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0]?.trim();
  return local || email;
}
