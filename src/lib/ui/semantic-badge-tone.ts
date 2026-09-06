export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "primary"
  | "info"
  | "purple";

export type SemanticBadgeKind = "specialty" | "status" | "exclusionType" | "category";

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(normalized: string, needles: readonly string[]): boolean {
  return needles.some((needle) => normalized.includes(needle));
}

function specialtyTone(normalized: string): StatusTone | null {
  if (includesAny(normalized, ["explos", "متفجر"])) return "warning";
  if (includesAny(normalized, ["stupefiant", "narcotic", "banknote", "billet", "مخدر"])) return "info";
  if (includesAny(normalized, ["monnaie", "currency", "عملة"])) return "purple";
  return null;
}

function statusTone(normalized: string): StatusTone | null {
  if (normalized === "oui" || normalized === "yes" || normalized === "نعم") return "warning";
  if (normalized === "non" || normalized === "no" || normalized === "لا") return "neutral";
  if (includesAny(normalized, ["sans chien", "without a dog", "without dog", "no dog", "بلا كلب"])) {
    return "neutral";
  }
  if (includesAny(normalized, ["disponible", "available", "متاح", "متوفر"])) return "success";
  if (includesAny(normalized, ["malade", "sick", "مريض", "blesse", "injured"])) return "danger";
  if (/(^|[^a-z\u0600-\u06FF])(exclus|exclu|excluded)([^a-z\u0600-\u06FF]|$)/.test(normalized)) {
    return "danger";
  }
  if (includesAny(normalized, ["hors service", "مستثنى"])) return "danger";
  if (includesAny(normalized, ["conge", "leave", "اجازة", "إجازة", "عطلة"])) return "warning";
  if (includesAny(normalized, ["chaleur", "heat", "حرارة"])) return "warning";
  if (includesAny(normalized, ["mission", "مهمة"])) return "warning";
  if (includesAny(normalized, ["expire", "inactif", "inactive", "retired", "retraite", "منته"])) return "neutral";
  if (/(^|[^a-z\u0600-\u06FF])(actifs|actif|actives|active|نشط)([^a-z\u0600-\u06FF]|$)/.test(normalized)) {
    return "info";
  }
  return null;
}

function exclusionTone(normalized: string): StatusTone | null {
  if (includesAny(normalized, ["malade", "sick", "مريض", "blesse", "injured", "blessé"])) return "danger";
  if (includesAny(normalized, ["suspension", "إيقاف"])) return "danger";
  if (includesAny(normalized, ["conge", "leave", "اجازة", "إجازة"])) return "warning";
  if (includesAny(normalized, ["chaleur", "heat"])) return "warning";
  if (includesAny(normalized, ["mission", "observation", "vet", "veterinaire"])) return "warning";
  if (includesAny(normalized, ["sans maitre", "without handler", "بدون"])) return "warning";
  if (includesAny(normalized, ["dressage", "formation", "training"])) return "info";
  if (normalized === "rest" || includesAny(normalized, ["repos", "retraite", "راحة"])) return "purple";
  return null;
}

export function resolveSemanticBadgeTone(
  value: string,
  kind: SemanticBadgeKind = "category",
): StatusTone {
  const normalized = normalizeLabel(value);
  if (!normalized || normalized === "—") return "neutral";

  if (kind === "specialty") {
    return specialtyTone(normalized) ?? "primary";
  }
  if (kind === "status") {
    return statusTone(normalized) ?? specialtyTone(normalized) ?? "danger";
  }
  if (kind === "exclusionType") {
    return exclusionTone(normalized) ?? statusTone(normalized) ?? "primary";
  }

  return (
    specialtyTone(normalized) ??
    statusTone(normalized) ??
    exclusionTone(normalized) ??
    "primary"
  );
}
