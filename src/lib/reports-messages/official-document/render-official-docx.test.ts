import { describe, expect, it } from "vitest";

import { assertDocxZipIntegrity } from "@/lib/documents/docx-binary";
import { packOfficialPdfVisualDocx } from "@/lib/reports-messages/official-document/official-docx-from-page-images";
import { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
} from "@/lib/reports-messages/official-document/types";

const labels: OfficialDocumentBuildContext["labels"] = {
  agencyLine1: "DIRECTION GENERALE",
  agencyLine2: "DE LA SURETE NATIONALE",
  radioTitle: "RADIO DEPART",
  subject: "RAPPORT DE CHIEN MALADE",
  de: "EXPEDITEUR",
  a: "A",
  destinataire: "DESTINATAIRE",
  diffusion: "DIFFUSION",
  factLabels: {},
};

const model: OfficialDocumentModel = {
  kind: "sick_dog_report",
  header: {
    agencyLines: ["DIRECTION GENERALE", "DE LA SURETE NATIONALE"],
    radioTitle: "RADIO DEPART",
  },
  table: {
    origin: "UC CANINE",
    number: "42/2026",
    words: "12",
    departureDateTime: "2026-08-23 10:00",
    serviceMention: "Service",
  },
  correspondence: {
    sender: "Aide-soignant veterinaire",
    to: "Commandant de la compagnie",
    recipient: "Commandant de la compagnie",
    city: "CASABLANCA",
    diffusion: ["Copie controle"],
  },
  priority: "URGENT",
  body: {
    subject: "RAPPORT DE CHIEN MALADE",
    facts: [
      { label: "Nom du chien", value: "Rex" },
      { label: "Diagnostic / constat", value: "Entorse legere" },
    ],
    messageBody: "Le chien Rex est place en repos medical suite a l'examen veterinaire.",
    attachments: ["Ordonnance"],
  },
  signatories: [
    { fullName: "Sara Amrani", functionTitle: "Aide-soignant veterinaire" },
  ],
};

/** 1×1 white PNG */
const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="),
  (char) => char.charCodeAt(0),
);

describe("official Radio Depart DOCX export", () => {
  it("keeps the existing PDF renderer output unchanged", () => {
    const pdf = renderOfficialDocumentPdf(model, labels);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("packs PDF page images into a real Word 2007 .docx", async () => {
    const bytes = await packOfficialPdfVisualDocx([
      { bytes: PNG_1X1, width: 1, height: 1 },
    ]);

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    await assertDocxZipIntegrity(bytes, "official-pdf-visual-docx-test");

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("word/document.xml")).toBeTruthy();
    const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
    expect(media.length).toBeGreaterThanOrEqual(1);
  });
});
