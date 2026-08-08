import { jsPDF } from "jspdf";
import { FP_OFFICIAL_LOGO_URL } from "@/lib/documents/feuille-presence-layout";
import {
  buildFeuillePresenceLogoAsset,
  drawFeuillePresenceLogoContained,
  type FeuillePresenceLogoAsset,
} from "@/lib/documents/feuille-presence-logo";
import { loadFeuillePresenceLogo } from "@/lib/documents/feuille-presence-pdf";
import { formatAgentBirthDateDisplay } from "@/lib/agent-birth-date";
import {
  formatMaritalStatusPdfLabel,
  type MaritalStatusValue,
} from "@/lib/marital-status";

const PAGE = { w: 210, h: 297 };
const MARGIN = 16;
/** Extra top padding so the logo sits lower with more white space above. */
const TOP_OFFSET = 10;
const CONTENT_W = PAGE.w - MARGIN * 2;
const PHOTO_SIZE = 36;
const FONT_SIZE = 11.5;
const LINE_GAP = 11;
/** Header seal — previous 22 mm + ~30%. */
const HEADER_LOGO_BOX = 29;
/** Vertical gap between logo bottom and title baseline. */
const LOGO_TO_TITLE_GAP = 16;
/** Full-page watermark opacity (4%–7%). */
const WATERMARK_OPACITY = 0.055;
const WATERMARK_BOX = Math.min(PAGE.w, PAGE.h) * 0.88;

export type AgentFicheIndividuelleInput = {
  firstName: string;
  lastName: string;
  grade: string;
  /** Already localized display label (e.g. « Chef de section »). */
  fonctionLabel: string;
  gender: "male" | "female";
  maritalStatus?: MaritalStatusValue;
  /** ISO `yyyy-MM-dd` or empty when unknown (legacy rows). */
  dateNaissance?: string | null;
  origine?: string | null;
  phone?: string | null;
  professionalNumber: string;
  sectionName?: string | null;
  /** Section line is shown only for Cynotechniciens. */
  showSection: boolean;
  address?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
};

type ResolvedFiche = AgentFicheIndividuelleInput & {
  photoDataUrl: string | null;
};

type FormCell =
  | { kind: "field"; label: string; value: string }
  | { kind: "gender" };

function blank(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Prénom + Nom — never drop either part. */
function formatEmployeeFullName(firstName: string, lastName: string): string {
  return `${blank(firstName)} ${blank(lastName)}`.replace(/\s+/g, " ").trim();
}

function maritalFormValue(value: MaritalStatusValue): string {
  const label = formatMaritalStatusPdfLabel(value);
  return label === "NON RENSEIGNÉ" ? "" : label;
}

async function resolveImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawUnderlinedField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  options?: { preserveFullValue?: boolean },
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  const labelText = `${label} :`;
  doc.text(labelText, x, y);
  const labelW = doc.getTextWidth(labelText);
  const lineX = x + labelW + 2;
  const lineEnd = x + width;
  if (lineEnd <= lineX + 6) return LINE_GAP;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);

  if (!value) {
    doc.line(lineX, y + 1.5, lineEnd, y + 1.5);
    return LINE_GAP;
  }

  const maxValueW = Math.max(6, lineEnd - lineX - 2);

  if (options?.preserveFullValue) {
    // Keep the entire name visible — wrap onto extra underlined lines if needed.
    const lines = doc.splitTextToSize(value, maxValueW) as string[];
    for (let i = 0; i < lines.length; i += 1) {
      const ly = y + i * (LINE_GAP - 1);
      doc.text(lines[i]!, lineX + 1, ly);
      doc.line(lineX, ly + 1.5, lineEnd, ly + 1.5);
    }
    return Math.max(LINE_GAP, lines.length * (LINE_GAP - 1) + 2);
  }

  // Prefer fitting on one line by slightly reducing font size before truncating.
  let size = FONT_SIZE;
  doc.setFontSize(size);
  while (size > 8.5 && doc.getTextWidth(value) > maxValueW) {
    size -= 0.4;
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(value) <= maxValueW) {
    doc.text(value, lineX + 1, y);
  } else {
    const display = (doc.splitTextToSize(value, maxValueW) as string[])[0] ?? value;
    doc.text(display, lineX + 1, y);
  }
  doc.setFontSize(FONT_SIZE);
  doc.line(lineX, y + 1.5, lineEnd, y + 1.5);
  return LINE_GAP;
}

function drawGenderField(
  doc: jsPDF,
  gender: "male" | "female",
  x: number,
  y: number,
  width: number,
): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  const labelText = "Sexe :";
  doc.text(labelText, x, y);

  const box = 3.2;
  let cursor = x + doc.getTextWidth(labelText) + 4;
  const options: Array<{ label: string; checked: boolean }> = [
    { label: "Masculin", checked: gender === "male" },
    { label: "Féminin", checked: gender === "female" },
  ];

  for (const option of options) {
    if (cursor + box + 20 > x + width) break;
    doc.setLineWidth(0.3);
    doc.rect(cursor, y - box + 0.6, box, box);
    if (option.checked) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("X", cursor + 0.7, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(FONT_SIZE);
    }
    doc.text(option.label, cursor + box + 1.5, y);
    cursor += box + 1.5 + doc.getTextWidth(option.label) + 6;
  }
}

function drawPhotoFrame(
  doc: jsPDF,
  photoDataUrl: string | null,
  x: number,
  y: number,
  size: number,
): void {
  doc.setDrawColor(0, 0, 0);
  if (photoDataUrl) {
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([], 0);
    doc.rect(x, y, size, size);
    try {
      const format = photoDataUrl.startsWith("data:image/png")
        ? "PNG"
        : photoDataUrl.startsWith("data:image/webp")
          ? "WEBP"
          : "JPEG";
      const props = doc.getImageProperties(photoDataUrl);
      const aspect = props.width / Math.max(props.height, 1);
      let w = size - 2;
      let h = size - 2;
      if (aspect >= 1) h = w / aspect;
      else w = h * aspect;
      doc.addImage(
        photoDataUrl,
        format,
        x + (size - w) / 2,
        y + (size - h) / 2,
        w,
        h,
        undefined,
        "FAST",
      );
    } catch {
      // empty frame if decode fails
    }
    return;
  }

  doc.setLineWidth(0.35);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.rect(x, y, size, size);
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Photo", x + size / 2, y + size / 2 + 1, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

function drawNotesBlock(
  doc: jsPDF,
  notes: string,
  x: number,
  y: number,
  width: number,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("Notes", x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SIZE);

  const lineCount = 8;
  const startY = y + 8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);

  const textLines = notes.trim()
    ? (doc.splitTextToSize(notes.trim(), width) as string[])
    : [];

  for (let i = 0; i < lineCount; i += 1) {
    const ly = startY + i * LINE_GAP;
    if (textLines[i]) {
      doc.text(textLines[i], x, ly);
    }
    doc.line(x, ly + 1.5, x + width, ly + 1.5);
  }
}

function drawCell(
  doc: jsPDF,
  cell: FormCell,
  gender: "male" | "female",
  x: number,
  y: number,
  width: number,
): number {
  if (cell.kind === "gender") {
    drawGenderField(doc, gender, x, y, width);
    return LINE_GAP;
  }
  return drawUnderlinedField(doc, cell.label, cell.value, x, y, width);
}

function buildFormColumns(data: ResolvedFiche): {
  fullName: string;
  left: FormCell[];
  right: FormCell[];
} {
  const left: FormCell[] = [
    { kind: "field", label: "Grade", value: blank(data.grade) },
    { kind: "field", label: "Fonction", value: blank(data.fonctionLabel) },
    { kind: "gender" },
    {
      kind: "field",
      label: "Situation familiale",
      value: maritalFormValue(data.maritalStatus),
    },
    {
      kind: "field",
      label: "Date de naissance",
      value: formatAgentBirthDateDisplay(data.dateNaissance),
    },
    { kind: "field", label: "Téléphone", value: blank(data.phone) },
  ];

  const right: FormCell[] = [
    { kind: "field", label: "Matricule", value: blank(data.professionalNumber) },
  ];
  if (data.showSection) {
    right.push({ kind: "field", label: "Section", value: blank(data.sectionName) });
  }
  right.push({ kind: "field", label: "Origine", value: blank(data.origine) });
  right.push({ kind: "field", label: "Adresse", value: blank(data.address) });

  return {
    fullName: formatEmployeeFullName(data.firstName, data.lastName),
    left,
    right,
  };
}

export function renderAgentFicheIndividuellePdf(
  data: ResolvedFiche,
  logoBytes?: Uint8Array,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  let logoAsset: FeuillePresenceLogoAsset | undefined;
  if (logoBytes && logoBytes.byteLength > 0) {
    try {
      logoAsset = buildFeuillePresenceLogoAsset(doc, logoBytes, "PNG");
    } catch {
      logoAsset = undefined;
    }
  }

  // Watermark first — stays behind all subsequent content.
  if (logoAsset) {
    drawFeuillePresenceLogoContained(
      doc,
      logoAsset,
      PAGE.w / 2,
      PAGE.h / 2,
      WATERMARK_BOX,
      { opacity: WATERMARK_OPACITY },
    );
  }

  let y = MARGIN + TOP_OFFSET;

  if (logoAsset) {
    drawFeuillePresenceLogoContained(
      doc,
      logoAsset,
      PAGE.w / 2,
      y + HEADER_LOGO_BOX / 2,
      HEADER_LOGO_BOX,
    );
  }
  y += HEADER_LOGO_BOX + LOGO_TO_TITLE_GAP;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("FICHE INDIVIDUELLE DU FONCTIONNAIRE", PAGE.w / 2, y, {
    align: "center",
  });
  y += 5;

  doc.setLineWidth(0.45);
  doc.line(MARGIN, y, PAGE.w - MARGIN, y);
  y += 10;

  const photoX = PAGE.w - MARGIN - PHOTO_SIZE;
  const photoY = y - 2;
  drawPhotoFrame(doc, data.photoDataUrl, photoX, photoY, PHOTO_SIZE);

  const colGap = 12;
  const besidePhotoW = CONTENT_W - PHOTO_SIZE - 8;
  const leftWBeside = (besidePhotoW - colGap) / 2;
  const rightXBeside = MARGIN + leftWBeside + colGap;
  const leftWFull = (CONTENT_W - colGap) / 2;
  const rightXFull = MARGIN + leftWFull + colGap;

  const { fullName, left, right } = buildFormColumns(data);

  // Full name uses the full width beside the photo so it is never clipped to a half-column.
  let rowY = y + 5;
  const nameHeight = drawUnderlinedField(
    doc,
    "Nom et prénom",
    fullName,
    MARGIN,
    rowY,
    besidePhotoW,
    { preserveFullValue: true },
  );
  rowY += nameHeight + 2;

  const rowCount = Math.max(left.length, right.length);

  for (let i = 0; i < rowCount; i += 1) {
    const besidePhoto = rowY < photoY + PHOTO_SIZE + 4;
    const leftW = besidePhoto ? leftWBeside : leftWFull;
    const rightX = besidePhoto ? rightXBeside : rightXFull;
    const rightW = besidePhoto ? leftWBeside : leftWFull;

    let rowHeight = LINE_GAP;
    const leftCell = left[i];
    if (leftCell) {
      rowHeight = Math.max(rowHeight, drawCell(doc, leftCell, data.gender, MARGIN, rowY, leftW));
    }

    const rightCell = right[i];
    if (rightCell) {
      rowHeight = Math.max(
        rowHeight,
        drawCell(doc, rightCell, data.gender, rightX, rowY, rightW),
      );
    }

    rowY += rowHeight;
  }

  const notesY = Math.max(rowY + 8, photoY + PHOTO_SIZE + 12);
  drawNotesBlock(doc, blank(data.notes), MARGIN, notesY, CONTENT_W);

  return doc;
}

export async function generateAgentFicheIndividuellePdf(
  input: AgentFicheIndividuelleInput,
  logoUrl: string = FP_OFFICIAL_LOGO_URL,
): Promise<jsPDF> {
  const [logoBytes, photoDataUrl] = await Promise.all([
    loadFeuillePresenceLogo(logoUrl),
    resolveImageDataUrl(input.photoUrl),
  ]);
  return renderAgentFicheIndividuellePdf({ ...input, photoDataUrl }, logoBytes);
}

export async function downloadAgentFicheIndividuellePdf(
  input: AgentFicheIndividuelleInput,
  filename?: string,
): Promise<void> {
  const doc = await generateAgentFicheIndividuellePdf(input);
  const safeName =
    filename ??
    `fiche-individuelle-${input.lastName}-${input.firstName}`
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/gi, "");
  doc.save(safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`);
}

export async function printAgentFicheIndividuellePdf(
  input: AgentFicheIndividuelleInput,
): Promise<void> {
  const doc = await generateAgentFicheIndividuellePdf(input);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank", "noopener,noreferrer");
}
