/**
 * Fonctionnaires List PDF — two tables (admin + Cynotechniciens).
 * Run: npx --yes tsx scripts/verify-personnel-list-pdf-order.mjs
 */
import { buildCynotechniciansListPdfData } from "../src/lib/documents/build-cynotechnicians-list-pdf-data.ts";
import { FP_CYNOTECHNICIANS_LIST_TITLE } from "../src/lib/documents/feuille-presence-layout.ts";
import {
  PDF_ADMIN_TABLE_TITLE,
  PDF_OPERATIONAL_TABLE_TITLE,
  PDF_PERSONNEL_FONCTION_LABELS,
  splitPersonnelIntoTwoTables,
} from "../src/lib/documents/personnel-two-tables.ts";
import { personnelGradeSortRank } from "../src/lib/documents/personnel-grade-rank.ts";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

function agent(partial) {
  return {
    id: partial.id ?? partial.professional_number,
    first_name: partial.first_name ?? "A",
    last_name: partial.last_name ?? "Z",
    professional_number: partial.professional_number,
    grade: partial.grade ?? "Brigadier",
    gender: "male",
    fonction: partial.fonction,
    marital_status: "single",
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
    sections: partial.sections ?? null,
    dogs: partial.dogs ?? null,
  };
}

assert(
  personnelGradeSortRank("Commissaire") < personnelGradeSortRank("Brigadier"),
  "Commissaire ranks above Brigadier",
);

const shuffled = [
  agent({
    professional_number: "300",
    fonction: "cynotechnicien",
    grade: "Brigadier",
    last_name: "Zidane",
    first_name: "Karim",
    dog_id: "d1",
    dogs: { id: "d1", name: "Rex", specialty: "narcotics", status: "available" },
  }),
  agent({
    professional_number: "100",
    fonction: "chef_brigadier",
    grade: "Commissaire",
    last_name: "Alaoui",
    first_name: "Omar",
  }),
  agent({
    professional_number: "200",
    fonction: "secretaire",
    grade: "Brigadier",
    last_name: "Benali",
    first_name: "Sara",
  }),
  agent({
    professional_number: "301",
    fonction: "cynotechnicien",
    grade: "Brigadier Chef",
    last_name: "Amrani",
    first_name: "Yassine",
  }),
  agent({
    professional_number: "050",
    fonction: "aide_soignant_veterinaire",
    grade: "Gardien",
    last_name: "First",
    first_name: "Inserted",
  }),
  agent({
    professional_number: "150",
    fonction: "chef_de_section",
    grade: "Inspecteur",
    last_name: "Chraibi",
    first_name: "Nabil",
  }),
];

assert(
  FP_CYNOTECHNICIANS_LIST_TITLE === "LISTE DES FONCTIONNAIRES",
  "PDF document title is Liste des fonctionnaires",
);

const data = buildCynotechniciansListPdfData(shuffled, []);
assert(data.tables.length === 2, "exactly two tables when both groups present");
assert(data.tables[0].layout === "administrative", "table 1 is administrative");
assert(data.tables[0].title === PDF_ADMIN_TABLE_TITLE, "admin title");
assert(data.tables[1].layout === "operational", "table 2 is operational");
assert(data.tables[1].title === PDF_OPERATIONAL_TABLE_TITLE, "cyno title only");
assert(
  data.tables.every((table) => table.rows.every((row) => row.situation === "Disponible")),
  "default Statut is Disponible without exclusions",
);

const withDogExclusion = buildCynotechniciansListPdfData(shuffled, [
  {
    agent_id: null,
    dog_id: "d1",
    exclusion_type: "female_dog_heat",
    start_date: "2020-01-01",
    end_date: "2099-12-31",
    active: true,
  },
]);
const heatRow = withDogExclusion.tables
  .flatMap((table) => table.rows)
  .find((row) => row.matricule === "300");
assert(heatRow?.situation === "Chienne en chaleur", "dog exclusion appears as Statut on PDF");

const admin = data.tables[0];
assert(admin.rows.length === 4, "all admin functions in one table");
assert(
  admin.rows.map((r) => r.fonction).join("|") ===
    [
      PDF_PERSONNEL_FONCTION_LABELS.chef_brigadier,
      PDF_PERSONNEL_FONCTION_LABELS.secretaire,
      PDF_PERSONNEL_FONCTION_LABELS.chef_de_section,
      PDF_PERSONNEL_FONCTION_LABELS.aide_soignant_veterinaire,
    ].join("|"),
  `admin hierarchy order: ${admin.rows.map((r) => r.fonction).join(" → ")}`,
);
assert(
  admin.rows.every((r) => r.chien === "-" && r.specialite === "-" && r.section === "-"),
  "admin without dog uses dash placeholders",
);
assert(admin.rows[0].fonction === "Chef Brigade", "Fonction value present on admin rows");

const cyno = data.tables[1];
assert(cyno.rows.length === 2, "cyno table has operational staff only");
assert(cyno.rows[0].matricule === "301", "cyno sorted by grade first");
assert(cyno.rows[0].chien === "Rex" || cyno.rows[1].chien === "Rex", "operational keeps chien");
assert(cyno.rows.every((r) => r.fonction === PDF_PERSONNEL_FONCTION_LABELS.cynotechnicien), "cyno rows keep fonction value for optional column");

// No per-function titles
assert(
  !data.tables.some((t) => t.title === "Chef Brigade" || t.title === "Secrétaire"),
  "no individual function section titles",
);

// Determinism
const data2 = buildCynotechniciansListPdfData([...shuffled].reverse(), []);
assert(JSON.stringify(data.tables) === JSON.stringify(data2.tables), "same order regardless of input order");

// Filter-like: admin only
const adminOnly = buildCynotechniciansListPdfData(
  shuffled.filter((a) => a.fonction !== "cynotechnicien"),
  [],
);
assert(adminOnly.tables.length === 1 && adminOnly.tables[0].layout === "administrative", "admin-only → one table");

// Filter-like: cyno only
const cynoOnly = buildCynotechniciansListPdfData(
  shuffled.filter((a) => a.fonction === "cynotechnicien"),
  [],
);
assert(cynoOnly.tables.length === 1 && cynoOnly.tables[0].layout === "operational", "cyno-only → one table");

const split = splitPersonnelIntoTwoTables(shuffled);
assert(split.administrative.length === 4 && split.operational.length === 2, "split helper counts");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll personnel two-table PDF checks passed.");
