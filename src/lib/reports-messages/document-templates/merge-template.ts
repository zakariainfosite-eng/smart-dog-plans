import { DOCUMENT_TEMPLATES } from "@/lib/reports-messages/document-templates/registry";
import { DEFAULT_SECTION_TITLES } from "@/lib/reports-messages/document-templates/section-catalog";
import type {
  DocumentTemplateConfig,
  TemplateFieldDefinition,
  TemplateSectionId,
} from "@/lib/reports-messages/document-templates/types";
import type {
  DocumentTemplatesSettings,
  SingleTemplateOverride,
  TemplateFieldOverride,
  TemplateHeaderOverride,
  TemplateSectionOverride,
  TemplateSignatureSlotOverride,
  TemplateDestinataireLineOverride,
  TemplateExpediteurLineOverride,
} from "@/lib/reports-messages/document-templates/template-overrides-store";
import {
  MESSAGE_DEMANDE_FIXED_EXPEDITEUR_LINES,
  MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES,
} from "@/lib/reports-messages/document-templates/message-demande";
import {
  DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE,
  normalizeHeatDogBodyToSingleParagraph,
} from "@/lib/reports-messages/document-templates/heat-dog-report";

export type EffectiveSectionMeta = TemplateSectionOverride;

export type EffectiveTemplateConfig = DocumentTemplateConfig & {
  sectionMeta: EffectiveSectionMeta[];
  /** Visible sections in order (before value-based conditional filters) */
  visibleSections: TemplateSectionId[];
  header: TemplateHeaderOverride;
  subjectOverride: string;
  signatureSlots: TemplateSignatureSlotOverride[];
  /** Message / Demande Destinataire lines (from Gestion des modèles) */
  destinataireLines: TemplateDestinataireLineOverride[];
  /** Message / Demande Expéditeur lines (from Gestion des modèles) */
  expediteurLines: TemplateExpediteurLineOverride[];
  /** Fixed body template with {{PLACEHOLDERS}} (heat dog) */
  reportBodyTemplate: string;
  fieldOverridesById: Record<string, TemplateFieldOverride>;
  updatedAt: string | null;
};

function defaultHeader(): TemplateHeaderOverride {
  return {
    organizationName: "DIRECTION GENERALE",
    department: "DE LA SURETE NATIONALE",
    radioTitle: "RADIO DEPART",
  };
}

function defaultSectionsFromConfig(config: DocumentTemplateConfig): TemplateSectionOverride[] {
  return config.sections.map((id) => ({
    id,
    visible: true,
    title: DEFAULT_SECTION_TITLES[id] ?? id,
    showTitle: id !== "official_header" && id !== "priority",
    defaultText: "",
    hideWhenEmptyFieldIds: defaultHideWhenEmpty(id),
    showWhenFieldFilled: id === "dog_information" ? "dogId" : undefined,
  }));
}

function defaultHideWhenEmpty(id: TemplateSectionId): string[] {
  switch (id) {
    case "treatment":
      return ["treatment", "medication"];
    case "rest_period":
      return ["restPeriod"];
    case "observation":
      return ["clinicalObservations", "diagnosis", "examReason", "additionalObservations"];
    case "attachments":
      return ["attachments"];
    case "introduction":
      return [];
    default:
      return [];
  }
}

function defaultDestinataireLines(
  config?: DocumentTemplateConfig,
): TemplateDestinataireLineOverride[] {
  if (
    config?.builder === "message_demande" ||
    config?.builder === "heat_dog" ||
    config?.id === "veterinary_message" ||
    config?.id === "injured_dog_report"
  ) {
    return MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES.map((line) => ({
      left: line.left,
      right: line.right ?? "",
    }));
  }
  return [];
}

function defaultExpediteurLines(
  config?: DocumentTemplateConfig,
): TemplateExpediteurLineOverride[] {
  if (
    config?.builder === "message_demande" ||
    config?.builder === "heat_dog" ||
    config?.id === "veterinary_message" ||
    config?.id === "injured_dog_report"
  ) {
    return MESSAGE_DEMANDE_FIXED_EXPEDITEUR_LINES.map((text) => ({ text }));
  }
  return [];
}

function defaultReportBodyTemplate(config?: DocumentTemplateConfig): string {
  if (config?.builder === "heat_dog" || config?.id === "injured_dog_report") {
    return normalizeHeatDogBodyToSingleParagraph(DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE);
  }
  return "";
}

function defaultSignatureSlots(
  config?: DocumentTemplateConfig,
): TemplateSignatureSlotOverride[] {
  // Message / Demande + heat dog defaults — only used on create / restore default template.
  if (
    config?.builder === "message_demande" ||
    config?.builder === "heat_dog" ||
    config?.id === "veterinary_message" ||
    config?.id === "injured_dog_report"
  ) {
    return [
      { nameHint: "HOUSSAINE EL KARIM", functionHint: "BPCY - PI" },
      { nameHint: "MOHAMED FARASSI", functionHint: "CHEF BPJ" },
      { nameHint: "MOULAY SAAD IDRISSI", functionHint: "CHEF DPM" },
      { nameHint: "ABDELKBIR FARAH", functionHint: "PP - TANGER" },
    ];
  }
  return [
    { nameHint: "Nom et prénom", functionHint: "Fonction" },
    { nameHint: "", functionHint: "" },
  ];
}

/** Build a full editable override from code defaults (for editor + reset). */
export function buildDefaultOverrideFromConfig(
  config: DocumentTemplateConfig,
): SingleTemplateOverride {
  return {
    active: config.active,
    updatedAt: null,
    subjectOverride: "",
    header: defaultHeader(),
    sections: defaultSectionsFromConfig(config),
    fields: config.fields.map((field) => fieldToOverride(field)),
    signatureSlots: defaultSignatureSlots(config),
    destinataireLines: defaultDestinataireLines(config),
    expediteurLines: defaultExpediteurLines(config),
    reportBodyTemplate: defaultReportBodyTemplate(config),
    heatDogTableFields: [],
  };
}

function fieldToOverride(field: TemplateFieldDefinition): TemplateFieldOverride {
  return {
    id: field.id,
    label: undefined,
    required: field.required,
    visible: true,
    source: field.source === "database" ? "database" : field.binding ? "database" : "manual",
    binding: field.binding,
    defaultValue: "",
    placeholder: "",
    multiline: field.type === "textarea",
    fixedText: "",
    type: field.type,
    section: field.section,
  };
}

export function getManagedTemplateIds(): string[] {
  return DOCUMENT_TEMPLATES.filter((item) =>
    [
      "veterinary_message",
      "sick_dog_report",
      "injured_dog_report",
      "vet_visit_report",
      "care_report",
      "dog_follow_up_report",
      "veterinary_monthly_report",
    ].includes(item.id),
  ).map((item) => item.id);
}

export function resolveEffectiveTemplate(
  templateId: string,
  settings: DocumentTemplatesSettings,
  snapshot?: SingleTemplateOverride | null,
): EffectiveTemplateConfig | null {
  const base = DOCUMENT_TEMPLATES.find((item) => item.id === templateId);
  if (!base) return null;

  const defaults = buildDefaultOverrideFromConfig(base);
  const stored = snapshot ?? settings.byId[templateId] ?? null;
  const merged = mergeOverrides(defaults, stored);

  const fields = applyFieldOverrides(base.fields, merged.fields);
  const allowObjectif = base.showObjectif !== false;
  const visibleSections = merged.sections
    .filter((s) => s.visible)
    .map((s) => s.id)
    .filter((id) => allowObjectif || id !== "introduction");

  return {
    ...base,
    active: merged.active,
    sections: visibleSections.length > 0 ? visibleSections : base.sections.filter(
      (id) => allowObjectif || id !== "introduction",
    ),
    fields,
    sectionMeta: allowObjectif
      ? merged.sections
      : merged.sections.filter((s) => s.id !== "introduction"),
    visibleSections,
    header: merged.header,
    subjectOverride: merged.subjectOverride,
    signatureSlots: merged.signatureSlots,
    destinataireLines: merged.destinataireLines,
    expediteurLines: merged.expediteurLines,
    reportBodyTemplate: merged.reportBodyTemplate,
    fieldOverridesById: Object.fromEntries(merged.fields.map((f) => [f.id, f])),
    updatedAt: merged.updatedAt,
  };
}

function mergeOverrides(
  defaults: SingleTemplateOverride,
  stored: SingleTemplateOverride | null,
): SingleTemplateOverride {
  if (!stored) return defaults;

  const sectionById = new Map(defaults.sections.map((s) => [s.id, s]));
  const mergedSections: TemplateSectionOverride[] = [];

  if (stored.sections.length > 0) {
    for (const row of stored.sections) {
      const base = sectionById.get(row.id);
      mergedSections.push({
        ...(base ?? {
          id: row.id,
          visible: true,
          title: DEFAULT_SECTION_TITLES[row.id] ?? row.id,
          showTitle: true,
          defaultText: "",
          hideWhenEmptyFieldIds: [],
        }),
        ...row,
        id: row.id,
      });
      sectionById.delete(row.id);
    }
    for (const leftover of sectionById.values()) {
      mergedSections.push({ ...leftover, visible: false });
    }
  } else {
    mergedSections.push(...defaults.sections);
  }

  const fieldById = new Map(defaults.fields.map((f) => [f.id, f]));
  const mergedFields: TemplateFieldOverride[] = [];
  if (stored.fields.length > 0) {
    for (const row of stored.fields) {
      const base = fieldById.get(row.id);
      mergedFields.push({ ...(base ?? { id: row.id }), ...row, id: row.id });
      fieldById.delete(row.id);
    }
    for (const leftover of fieldById.values()) {
      mergedFields.push(leftover);
    }
  } else {
    mergedFields.push(...defaults.fields);
  }

  return {
    active: stored.active,
    updatedAt: stored.updatedAt,
    subjectOverride: stored.subjectOverride || defaults.subjectOverride,
    header: {
      organizationName: stored.header.organizationName || defaults.header.organizationName,
      department: stored.header.department || defaults.header.department,
      radioTitle: stored.header.radioTitle || defaults.header.radioTitle,
    },
    sections: mergedSections,
    fields: mergedFields,
    signatureSlots:
      stored.signatureSlots.length > 0 ? stored.signatureSlots : defaults.signatureSlots,
    destinataireLines:
      stored.destinataireLines.length > 0
        ? stored.destinataireLines
        : defaults.destinataireLines,
    expediteurLines:
      stored.expediteurLines.length > 0
        ? stored.expediteurLines
        : defaults.expediteurLines,
    reportBodyTemplate: normalizeHeatReportBody(
      stored.reportBodyTemplate.trim().length > 0
        ? stored.reportBodyTemplate
        : defaults.reportBodyTemplate,
      defaults.reportBodyTemplate,
    ),
    // Heat-dog Radio Départ is not configured here. Chiens list columns live on PDF_CHIEN_TEMPLATE.
    heatDogTableFields: stored.heatDogTableFields ?? [],
  };
}

function normalizeHeatReportBody(stored: string, fallback: string): string {
  const source = stored.trim().length > 0 ? stored : fallback;
  if (!fallback.trim()) return source;
  // Heat-dog defaults are non-empty — always store/resolve as a single paragraph.
  return normalizeHeatDogBodyToSingleParagraph(source);
}

function applyFieldOverrides(
  fields: TemplateFieldDefinition[],
  overrides: TemplateFieldOverride[],
): TemplateFieldDefinition[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  return fields
    .map((field) => {
      const o = byId.get(field.id);
      if (!o) return field;
      if (o.visible === false) return null;
      return {
        ...field,
        required: o.required ?? field.required,
        optional: o.required === true ? false : field.optional,
        source:
          o.source === "database"
            ? "database"
            : o.source === "manual"
              ? "manual"
              : field.source,
        binding: (o.binding as TemplateFieldDefinition["binding"]) ?? field.binding,
        type: o.multiline ? "textarea" : o.type ?? field.type,
        rows: o.multiline ? field.rows ?? 4 : field.rows,
      };
    })
    .filter((row): row is TemplateFieldDefinition => Boolean(row));
}

/** Value-based conditional visibility for sections. */
export function filterSectionsByValues(
  config: EffectiveTemplateConfig,
  values: Record<string, unknown>,
): TemplateSectionId[] {
  const isEmpty = (fieldId: string): boolean => {
    const value = values[fieldId];
    if (value == null) return true;
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean).length === 0;
    }
    return !String(value).trim();
  };

  return config.sectionMeta
    .filter((section) => {
      if (!section.visible) return false;
      if (section.showWhenFieldFilled && isEmpty(section.showWhenFieldFilled)) {
        return false;
      }
      if (section.hideWhenEmptyFieldIds.length > 0) {
        const allEmpty = section.hideWhenEmptyFieldIds.every((id) => isEmpty(id));
        if (allEmpty) return false;
      }
      return true;
    })
    .map((section) => section.id);
}

export function collectFixedTexts(config: EffectiveTemplateConfig): {
  introduction: string;
  sectionDefaults: Partial<Record<TemplateSectionId, string>>;
} {
  const sectionDefaults: Partial<Record<TemplateSectionId, string>> = {};
  for (const section of config.sectionMeta) {
    if (section.visible && section.defaultText.trim()) {
      sectionDefaults[section.id] = section.defaultText;
    }
  }
  const introduction =
    sectionDefaults.introduction ||
    config.fieldOverridesById.introduction?.fixedText ||
    "";
  return { introduction: introduction.trim(), sectionDefaults };
}

export function validateTemplateOverride(
  override: SingleTemplateOverride,
): string[] {
  const errors: string[] = [];
  const sectionIds = new Set<string>();
  for (const section of override.sections) {
    if (sectionIds.has(section.id)) {
      errors.push(`duplicate_section:${section.id}`);
    }
    sectionIds.add(section.id);
  }
  const fieldIds = new Set<string>();
  for (const field of override.fields) {
    if (fieldIds.has(field.id)) {
      errors.push(`duplicate_field:${field.id}`);
    }
    fieldIds.add(field.id);
  }
  if (override.sections.filter((s) => s.visible).length === 0) {
    errors.push("no_visible_sections");
  }
  if (!override.header.organizationName.trim() && !override.header.department.trim()) {
    errors.push("empty_header");
  }
  return errors;
}

export function overrideToSnapshot(override: SingleTemplateOverride): SingleTemplateOverride {
  return JSON.parse(JSON.stringify(override)) as SingleTemplateOverride;
}
