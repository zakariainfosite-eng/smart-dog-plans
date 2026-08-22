/**
 * Chiens PDF template → list export.
 * Run: npx --yes tsx scripts/verify-chien-list-pdf-template.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDogsListPdfData,
  buildSampleChienListPdfData,
} from "../src/lib/documents/build-dogs-list-pdf-data.ts";
import { FP_CONTENT_W, FP_DOGS_LIST_TITLE, FP_SIGNATURE_BRIGADE } from "../src/lib/documents/feuille-presence-layout.ts";
import { generateDogsListPdf } from "../src/lib/documents/feuille-presence-pdf.ts";
import { parseEntityPdfTableTemplate } from "../src/lib/reports-messages/entity-pdf-table-store.ts";
import {
  buildChienListTableCols,
  defaultChienPdfTableFields,
  normalizeChienPdfTableFieldConfigs,
} from "../src/lib/reports-messages/chien-pdf-table-fields.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "tmp");
mkdirSync(outDir, { recursive: true });

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

function exampleSelection() {
  const order = ["dogName", "breed", "specialty", "handlerName"];
  const enabled = new Set(order);
  const rest = defaultChienPdfTableFields()
    .filter((row) => !enabled.has(row.id))
    .map((row) => ({ ...row, enabled: false }));
  return [...order.map((id) => ({ id, enabled: true })), ...rest];
}

function reorderedSelection() {
  return [
    { id: "dogName", enabled: true },
    { id: "breed", enabled: true },
    { id: "specialty", enabled: true },
    { id: "handlerName", enabled: true },
    { id: "microchip", enabled: false },
    { id: "gender", enabled: false },
  ];
}

function pdfLatin1(doc) {
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

const exampleCols = buildChienListTableCols(exampleSelection(), FP_CONTENT_W);
assert(
  exampleCols.map((col) => col.key).join(",") === "dogName,breed,specialty,handlerName",
  "example selection keeps Nom du chien, Race, Spécialité, Nom du maître order",
);
assert(
  Math.abs(exampleCols.reduce((sum, col) => sum + col.w, 0) - FP_CONTENT_W) < 0.05,
  "column widths fill the official content width",
);

const savedPayload = {
  fields: exampleSelection(),
  updatedAt: "2026-08-22T16:00:00.000Z",
};
const reloaded = parseEntityPdfTableTemplate(JSON.parse(JSON.stringify(savedPayload)));
const afterRefresh = normalizeChienPdfTableFieldConfigs(reloaded.fields);
assert(
  buildChienListTableCols(afterRefresh, FP_CONTENT_W)
    .map((col) => col.key)
    .join(",") === "dogName,breed,specialty,handlerName",
  "saved application_settings payload survives JSON reload (page refresh)",
);

const droppedRadio = normalizeChienPdfTableFieldConfigs([
  { id: "origin", enabled: true },
  { id: "dogName", enabled: true },
]);
assert(
  !droppedRadio.some((row) => row.id === "origin"),
  "Radio Départ Origine is not a Chiens list field",
);

const sample = buildSampleChienListPdfData(exampleSelection());
assert(
  sample.columns.map((col) => col.key).join(",") === exampleCols.map((col) => col.key).join(","),
  "preview sample uses the same columns as the saved template",
);

function dog(partial) {
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    gender: partial.gender ?? "female",
    specialty: partial.specialty ?? "explosives",
    status: partial.status ?? "available",
    active: true,
    photo_url: null,
    breed: partial.breed ?? "Malinois",
    microchip_number: partial.microchip_number ?? "982000123456789",
    date_of_birth: partial.date_of_birth ?? "2021-03-12",
    training_level: null,
    veterinary_notes: null,
    observations: null,
    assignment_date: "2022-06-01",
    vaccination_info: null,
    health_status: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    agent: partial.agent ?? {
      id: "a1",
      first_name: "Raja",
      last_name: "El Kassmi",
      professional_number: "133398",
      grade: "GDPX",
      section: { id: "s1", name: "Section Explosifs" },
    },
  };
}

const exportData = buildDogsListPdfData(
  [
    dog({ name: "CHERRY", breed: "Malinois" }),
    dog({
      name: "REX",
      gender: "male",
      specialty: "narcotics",
      breed: "Berger allemand",
      agent: {
        id: "a2",
        first_name: "Karim",
        last_name: "Zidane",
        professional_number: "300",
        grade: "Brigadier",
        section: { id: "s2", name: "Section Stupéfiants" },
      },
    }),
  ],
  new Date("2026-08-22T12:00:00.000Z"),
  exampleSelection(),
);
assert(
  exportData.columns.map((col) => col.key).join(",") ===
    exampleCols.map((col) => col.key).join(","),
  "list export builder uses the same columns as preview",
);
assert(exportData.rows[0].nom === "CHERRY", "export maps the dog name");
assert(exportData.rows[0].cynotechnicien.includes("EL KASSMI"), "export maps the handler name");

const listDoc = generateDogsListPdf({
  data: buildSampleChienListPdfData(afterRefresh),
  year: 2026,
});
const listPdf = pdfLatin1(listDoc);
writeFileSync(join(outDir, "chien-list-template.pdf"), Buffer.from(listDoc.output("arraybuffer")));

assert(listPdf.includes(FP_DOGS_LIST_TITLE), "list PDF title is LISTE DES CHIENS");
assert(listPdf.includes("ROYAUME DU MAROC"), "list PDF keeps the official header");
assert(listPdf.includes("NOM DU CHIEN"), "list PDF header includes NOM DU CHIEN");
assert(listPdf.includes("RACE"), "list PDF header includes RACE");
assert(listPdf.includes("SPÉCIALITÉ"), "list PDF header includes SPÉCIALITÉ");
assert(!listPdf.includes("LA PUCE"), "list PDF omits the puce column when the field is disabled");
assert(
  !listPdf.includes(FP_SIGNATURE_BRIGADE),
  "list PDF has no signature block",
);
assert(!listPdf.includes("Origine"), "list PDF does not include Radio Départ Origine");

const raceOff = defaultChienPdfTableFields().map((row) =>
  row.id === "breed" ? { ...row, enabled: false } : row,
);
const raceOffDoc = generateDogsListPdf({
  data: buildSampleChienListPdfData(raceOff),
  year: 2026,
});
const raceOffPdf = pdfLatin1(raceOffDoc);
writeFileSync(join(outDir, "chien-list-no-race.pdf"), Buffer.from(raceOffDoc.output("arraybuffer")));
assert(!raceOffPdf.includes("RACE"), "disabling Race removes the Race column from the PDF");

const reorderedDoc = generateDogsListPdf({
  data: buildSampleChienListPdfData(reorderedSelection()),
  year: 2026,
});
const reorderedPdf = pdfLatin1(reorderedDoc);
writeFileSync(
  join(outDir, "chien-list-reordered.pdf"),
  Buffer.from(reorderedDoc.output("arraybuffer")),
);
const nomAt = reorderedPdf.indexOf("NOM DU CHIEN");
const raceAt = reorderedPdf.indexOf("RACE");
const specAt = reorderedPdf.indexOf("SPÉCIALITÉ");
const maitreAt = reorderedPdf.indexOf("NOM DU MAÎTRE");
assert(
  nomAt >= 0 && raceAt >= 0 && specAt >= 0 && maitreAt >= 0 && nomAt < raceAt && raceAt < specAt && specAt < maitreAt,
  "reordered PDF draws Nom du chien → Race → Spécialité → Maître",
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nChiens PDF template checks passed.");
