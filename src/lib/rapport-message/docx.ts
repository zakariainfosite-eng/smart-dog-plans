import { Buffer } from "buffer";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from "docx";
import { applyWord2007DocxCompatibility } from "@/lib/documents/docx-word2007-compat";
import { assertDocxZipIntegrity, toZipSafeUint8Array } from "@/lib/documents/docx-binary";
import { formatRapportMessageDate, splitBodyParagraphs } from "@/lib/rapport-message/format";
import type { RapportMessageDraft, RapportMessageExportLabels } from "@/lib/rapport-message/types";

function ensureDocxBuffer(): void {
  const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (typeof g.Buffer === "undefined") {
    g.Buffer = Buffer;
  }
}

function run(text: string, opts?: { bold?: boolean; size?: number; color?: string; italics?: boolean }) {
  return new TextRun({
    text,
    font: "Times New Roman",
    size: opts?.size ?? 22,
    bold: opts?.bold ?? false,
    italics: opts?.italics ?? false,
    color: opts?.color ?? "000000",
  });
}

function metaLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      run(`${label} : `, { bold: true, size: 22 }),
      run(value.trim() || "—", { size: 22 }),
    ],
  });
}

export async function generateRapportMessageDocx(
  draft: RapportMessageDraft,
  labels: RapportMessageExportLabels,
): Promise<Uint8Array> {
  ensureDocxBuffer();

  const bodyLines = splitBodyParagraphs(draft.body);
  const bodyParagraphs =
    bodyLines.length > 0
      ? bodyLines.map(
          (line) =>
            new Paragraph({
              spacing: { after: 200, line: 360 },
              alignment: AlignmentType.JUSTIFIED,
              children: [run(line || " ", { size: 22 })],
            }),
        )
      : [
          new Paragraph({
            spacing: { after: 200 },
            children: [run(" ", { size: 22 })],
          }),
        ];

  const headerLines = [labels.brand, labels.unitName?.trim()].filter(
    (line): line is string => Boolean(line),
  );

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(22),
              right: convertMillimetersToTwip(22),
            },
          },
        },
        headers: {
          default: new Header({
            children: headerLines.map(
              (line, index) =>
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: index === headerLines.length - 1 ? 80 : 40 },
                  children: [
                    run(line, {
                      bold: index === 0,
                      size: index === 0 ? 28 : 18,
                      color: "023A84",
                    }),
                  ],
                }),
            ),
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 12, color: "023A84", space: 8 },
            },
            children: [run(labels.documentTitle, { bold: true, size: 32, color: "023A84" })],
          }),
          metaLine(labels.date, formatRapportMessageDate(draft.date)),
          metaLine(labels.recipient, draft.recipient),
          metaLine(labels.sender, draft.sender),
          ...(draft.reference.trim()
            ? [metaLine(labels.reference, draft.reference)]
            : []),
          metaLine(labels.subject, draft.title),
          new Paragraph({
            spacing: { before: 160, after: 240 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 1 },
            },
            children: [],
          }),
          ...bodyParagraphs,
          new Paragraph({
            spacing: { before: 400, after: 80 },
            alignment: AlignmentType.RIGHT,
            children: [run(labels.signature, { bold: true, size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 40 },
            children: [run(draft.signature.trim() || draft.sender.trim() || " ", { size: 22 })],
          }),
        ],
      },
    ],
  });

  let packed: Uint8Array;
  if (typeof Blob !== "undefined") {
    const blob = await Packer.toBlob(doc);
    packed = toZipSafeUint8Array(await blob.arrayBuffer());
  } else {
    packed = toZipSafeUint8Array(await Packer.toArrayBuffer(doc));
  }
  packed = await applyWord2007DocxCompatibility(packed);
  await assertDocxZipIntegrity(packed, "rapport-message-docx");
  return packed;
}
