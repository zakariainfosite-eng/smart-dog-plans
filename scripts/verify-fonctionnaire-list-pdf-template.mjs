/**
 * Fonctionnaires PDF template → list export + fiche.
 * Run: npx --yes tsx scripts/verify-fonctionnaire-list-pdf-template.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderAgentFicheIndividuellePdf } from "../src/lib/agent-profile-export.ts";
import {
  buildCynotechniciansListPdfData,
  buildSampleFonctionnaireListPdfData,
} from "../src/lib/documents/build-cynotechnicians-list-pdf-data.ts";
import { FP_CONTENT_W } from "../src/lib/documents/feuille-presence-layout.ts";
import { generateCynotechniciansListPdf } from "../src/lib/documents/feuille-presence-pdf.ts";
import { parseEntityPdfTableTemplate } from "../src/lib/reports-messages/entity-pdf-table-store.ts";
import {
  applyFonctionnairePdfListScope,
  buildFonctionnaireListTableCols,
  defaultFonctionnairePdfTableFields,
  normalizeFonctionnairePdfTableFieldConfigs,
} from "../src/lib/reports-messages/fonctionnaire-pdf-table-fields.ts";
import {
  PDF_OPERATIONAL_TABLE_TITLE,
} from "../src/lib/documents/personnel-two-tables.ts";

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
  const order = ["lastName", "firstName", "matricule", "grade", "dogName", "specialty"];
  const enabled = new Set(order);
  const rest = defaultFonctionnairePdfTableFields()
    .filter((row) => !enabled.has(row.id))
    .map((row) => ({ ...row, enabled: false }));
  return [...order.map((id) => ({ id, enabled: true })), ...rest];
}

function reorderedSelection() {
  return [
    { id: "specialty", enabled: true },
    { id: "dogName", enabled: true },
    { id: "grade", enabled: true },
    { id: "matricule", enabled: true },
    { id: "firstName", enabled: true },
    { id: "lastName", enabled: true },
    { id: "section", enabled: false },
    { id: "fonction", enabled: false },
  ];
}

function pdfLatin1(doc) {
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

const exampleCols = buildFonctionnaireListTableCols(exampleSelection(), FP_CONTENT_W);
assert(
  exampleCols.map((col) => col.key).join(",") ===
    "lastName,firstName,matricule,grade,dogName,specialty",
  "example selection keeps Nom, Prénom, Matricule, Grade, Chien, Spécialité order",
);
assert(
  Math.abs(exampleCols.reduce((sum, col) => sum + col.w, 0) - FP_CONTENT_W) < 0.05,
  "column widths fill the official content width",
);

const savedPayload = {
  fields: exampleSelection(),
  listScope: "cynotechniciens",
  updatedAt: "2026-08-22T16:00:00.000Z",
};
const reloaded = parseEntityPdfTableTemplate(JSON.parse(JSON.stringify(savedPayload)));
const afterRefresh = normalizeFonctionnairePdfTableFieldConfigs(reloaded.fields);
assert(reloaded.listScope === "cynotechniciens", "listScope is stored on the same template payload");
assert(
  parseEntityPdfTableTemplate({ fields: exampleSelection() }).listScope === "all",
  "missing listScope defaults to Tous les fonctionnaires",
);
assert(
  buildFonctionnaireListTableCols(afterRefresh, FP_CONTENT_W)
    .map((col) => col.key)
    .join(",") === "lastName,firstName,matricule,grade,dogName,specialty",
  "saved application_settings payload survives JSON reload (page refresh)",
);

const orderCols = buildFonctionnaireListTableCols(reorderedSelection(), FP_CONTENT_W);
assert(
  orderCols.map((col) => col.key).join(",") ===
    "specialty,dogName,grade,matricule,firstName,lastName",
  "reordering enabled fields changes PDF column order",
);

const sample = buildSampleFonctionnaireListPdfData(exampleSelection(), "all");
assert(
  sample.tables[1].columns.map((col) => col.key).join(",") === exampleCols.map((col) => col.key).join(","),
  "preview sample cynotechnicien table uses the saved template columns",
);
assert(
  sample.tables[0].columns.map((col) => col.key).join(",") ===
    "lastName,firstName,matricule,grade",
  "preview sample administrative table omits Chien / Spécialité",
);

const adminPreview = buildSampleFonctionnaireListPdfData(exampleSelection(), "administrative");
const cynoPreview = buildSampleFonctionnaireListPdfData(exampleSelection(), "cynotechniciens");
assert(
  adminPreview.tables.map((table) => table.layout).join(",") === "administrative",
  "administrative listScope preview has only the admin table",
);
assert(
  cynoPreview.tables.map((table) => table.layout).join(",") === "operational",
  "cynotechniciens listScope preview has only the cyno table",
);
assert(
  adminPreview.columns.map((col) => col.key).join(",") === "lastName,firstName,matricule,grade",
  "administrative listScope omits cynotechnical columns",
);
assert(
  cynoPreview.columns.map((col) => col.key).join(",") ===
    "lastName,firstName,matricule,grade,dogName,specialty",
  "cynotechniciens listScope keeps cynotechnical columns",
);

function agent(partial) {
  return {
    id: partial.professional_number,
    first_name: partial.first_name,
    last_name: partial.last_name,
    professional_number: partial.professional_number,
    grade: partial.grade ?? "Brigadier",
    gender: "male",
    fonction: partial.fonction,
    marital_status: "single",
    date_naissance: "1990-01-01",
    origine: null,
    section_id: null,
    dog_id: partial.dog_id ?? null,
    is_section_chief: false,
    active: true,
    phone: null,
    address: null,
    observations: null,
    photo_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    sections: null,
    dogs: partial.dogs ?? null,
  };
}

const mixedAgents = [
  agent({
    professional_number: "100",
    fonction: "chef_brigadier",
    grade: "Commissaire",
    last_name: "Alaoui",
    first_name: "Omar",
  }),
  agent({
    professional_number: "300",
    fonction: "cynotechnicien",
    last_name: "Zidane",
    first_name: "Karim",
    dog_id: "d1",
    dogs: { id: "d1", name: "Rex", specialty: "narcotics", status: "available" },
  }),
];

const exportAll = buildCynotechniciansListPdfData(
  mixedAgents,
  [],
  new Date(),
  exampleSelection(),
  "all",
);
const exportAdmin = buildCynotechniciansListPdfData(
  mixedAgents,
  [],
  new Date(),
  exampleSelection(),
  "administrative",
);
const exportCyno = buildCynotechniciansListPdfData(
  mixedAgents,
  [],
  new Date(),
  exampleSelection(),
  "cynotechniciens",
);
assert(exportAll.tables.length === 2, "all listScope export keeps both groups");
assert(
  exportAdmin.tables.length === 1 &&
    exportAdmin.tables[0].layout === "administrative" &&
    exportAdmin.tables[0].rows.every((row) => row.matricule !== "300"),
  "administrative listScope export drops cynotechniciens",
);
assert(
  exportCyno.tables.length === 1 &&
    exportCyno.tables[0].layout === "operational" &&
    exportCyno.tables[0].rows.every((row) => row.matricule === "300"),
  "cynotechniciens listScope export drops administrative staff",
);
assert(
  exportAdmin.columns.map((col) => col.key).join(",") === "lastName,firstName,matricule,grade" &&
    exportCyno.columns.map((col) => col.key).join(",") ===
      cynoPreview.columns.map((col) => col.key).join(","),
  "preview and export share the same columns for a given list type",
);
assert(
  applyFonctionnairePdfListScope(
    { administrative: [1], operational: [2] },
    "cynotechniciens",
  ).administrative.length === 0,
  "single listScope helper is the only row filter",
);

assert(
  exportAll.tables[0].columns.map((col) => col.key).join(",") ===
    "lastName,firstName,matricule,grade",
  "all listScope admin table omits cynotechnical columns",
);
assert(
  exportAll.tables[1].columns.map((col) => col.key).join(",") ===
    exampleCols.map((col) => col.key).join(","),
  "all listScope cynotechnicien table uses the saved template columns",
);
assert(
  exportAll.tables[0].rows[0].chien === "" &&
    exportAll.tables[0].rows[0].specialite === "" &&
    exportAll.tables[0].rows[0].section === "",
  "administrative rows do not invent cynotechnical placeholders",
);
assert(exportAll.tables[1].rows[0].chien === "Rex", "cynotechnicien row keeps the real dog name");

const reloadedCynoPreview = buildSampleFonctionnaireListPdfData(afterRefresh, reloaded.listScope);
assert(
  reloadedCynoPreview.tables.map((table) => table.layout).join(",") === "operational",
  "saved listScope survives JSON reload in preview",
);

const cynoDoc = generateCynotechniciansListPdf({ data: exportCyno, year: 2026 });
writeFileSync(join(outDir, "fonctionnaire-list-cynotechniciens.pdf"), Buffer.from(cynoDoc.output("arraybuffer")));
const cynoPdf = pdfLatin1(cynoDoc);
assert(cynoPdf.includes(PDF_OPERATIONAL_TABLE_TITLE), "cynotechniciens PDF includes the cyno section title");
assert(
  !cynoPdf.includes("Personnel administratif"),
  "cynotechniciens PDF omits the administrative section",
);

const adminDoc = generateCynotechniciansListPdf({ data: exportAdmin, year: 2026 });
writeFileSync(join(outDir, "fonctionnaire-list-administrative.pdf"), Buffer.from(adminDoc.output("arraybuffer")));
const adminPdf = pdfLatin1(adminDoc);
assert(adminPdf.includes("Personnel administratif"), "administrative PDF includes the admin section title");
assert(!adminPdf.includes(PDF_OPERATIONAL_TABLE_TITLE), "administrative PDF omits the cyno section");
assert(!adminPdf.includes("CHIEN"), "administrative PDF omits the Chien column");
assert(!adminPdf.includes("SPÉCIALITÉ") && !adminPdf.includes("SPECIALITE"), "administrative PDF omits Spécialité");

const listDoc = generateCynotechniciansListPdf({
  data: buildSampleFonctionnaireListPdfData(afterRefresh),
  year: 2026,
});
const listPdf = pdfLatin1(listDoc);
writeFileSync(join(outDir, "fonctionnaire-list-template.pdf"), Buffer.from(listDoc.output("arraybuffer")));

assert(listPdf.includes("MATRICULE"), "list PDF header includes MATRICULE");
assert(listPdf.includes("GRADE"), "list PDF header includes GRADE");
assert(listPdf.includes("CHIEN"), "list PDF header includes CHIEN");
assert(!listPdf.includes("STATUT"), "list PDF does not keep the hardcoded STATUT column");
assert(
  !listPdf.includes("(SECTION)"),
  "list PDF omits the SECTION column header when the field is disabled",
);

const reorderedDoc = generateCynotechniciansListPdf({
  data: buildSampleFonctionnaireListPdfData(reorderedSelection(), "cynotechniciens"),
  year: 2026,
});
const reorderedPdf = pdfLatin1(reorderedDoc);
writeFileSync(
  join(outDir, "fonctionnaire-list-reordered.pdf"),
  Buffer.from(reorderedDoc.output("arraybuffer")),
);
const chienAt = reorderedPdf.indexOf("CHIEN");
const matriculeAt = reorderedPdf.indexOf("MATRICULE");
assert(chienAt >= 0 && matriculeAt >= 0 && chienAt < matriculeAt, "reordered PDF draws CHIEN before MATRICULE");

const ficheDoc = renderAgentFicheIndividuellePdf({
  firstName: "Raja",
  lastName: "El Kassmi",
  grade: "GDPX",
  fonctionLabel: "Cynotechnicien",
  gender: "male",
  maritalStatus: "married",
  dateNaissance: "1990-04-15",
  origine: "Tanger",
  phone: "0600000000",
  professionalNumber: "133398",
  sectionName: "Section Explosifs",
  showSection: true,
  address: "Tanger",
  notes: "Notes internes",
  photoUrl: null,
  photoDataUrl: null,
  dogName: "CHERRY",
  specialtyLabel: "EXPLOSIFS",
  pdfTableFields: afterRefresh,
});
const fichePdf = pdfLatin1(ficheDoc);
writeFileSync(join(outDir, "fonctionnaire-fiche-template.pdf"), Buffer.from(ficheDoc.output("arraybuffer")));
assert(fichePdf.includes("Matricule") || fichePdf.includes("MATRICULE"), "fiche includes Matricule");
assert(fichePdf.includes("133398"), "fiche includes matricule value");
assert(fichePdf.includes("CHERRY"), "fiche includes selected Chien value");
assert(!fichePdf.includes("0600000000"), "fiche omits Téléphone when the field is disabled");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nFonctionnaires PDF template checks passed.");
