/**
 * Personnel fonction hierarchy — order, mapping, business rules.
 * Run: npx --yes tsx scripts/verify-personnel-fonction-hierarchy.mjs
 */
import {
  PERSONNEL_FONCTIONS,
  normalizePersonnelFonction,
  parsePersonnelFonctionStrict,
  isCynotechnicienFonction,
  isChefDeSectionFonction,
  mayHaveSectionFonction,
} from "../src/lib/personnel-fonction.ts";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

const expected = [
  "chef_brigadier",
  "chef_brigadier_pi",
  "chef_secretariat",
  "secretaire",
  "assistant_technique",
  "chef_de_section",
  "chef_de_section_pi",
  "chef_materiel",
  "aide_soignant_veterinaire",
  "cynotechnicien",
];

assert(
  PERSONNEL_FONCTIONS.length === 10 &&
    PERSONNEL_FONCTIONS.every((v, i) => v === expected[i]),
  "hierarchy order exact (10 roles)",
);

assert(
  normalizePersonnelFonction("chef_de_section") === "chef_de_section",
  "existing chef_de_section preserved",
);
assert(
  normalizePersonnelFonction("cynotechnicien") === "cynotechnicien",
  "existing cynotechnicien preserved",
);
assert(
  normalizePersonnelFonction("chef_materiel") === "chef_materiel",
  "existing chef_materiel preserved",
);
assert(
  normalizePersonnelFonction("chef_brigadier") === "chef_brigadier",
  "chef_brigadier canonical",
);
assert(
  normalizePersonnelFonction("chef_brigade") === "chef_brigadier",
  "alias chef_brigade → chef_brigadier",
);
assert(
  normalizePersonnelFonction("chef_brigade_pi") === "chef_brigadier_pi",
  "alias chef_brigade_pi → chef_brigadier_pi",
);
assert(
  normalizePersonnelFonction("section_chief") === "chef_de_section",
  "alias section_chief → chef_de_section",
);
assert(
  normalizePersonnelFonction("unknown_role") === "cynotechnicien",
  "unknown → cynotechnicien (compat)",
);

assert(
  parsePersonnelFonctionStrict("secretaire") === "secretaire",
  "strict parse secretaire",
);
assert(
  parsePersonnelFonctionStrict("chef_brigade") === "chef_brigadier",
  "strict parse accepts legacy chef_brigade",
);
assert(
  parsePersonnelFonctionStrict("chef_de_section_pi") === "chef_de_section_pi",
  "strict parse chef_de_section_pi",
);

let threw = false;
try {
  parsePersonnelFonctionStrict("not_a_real_fonction");
} catch {
  threw = true;
}
assert(threw, "strict parse rejects unknown");

assert(isCynotechnicienFonction("cynotechnicien"), "only cyno is operational");
assert(!isCynotechnicienFonction("chef_brigadier"), "chef brigadier not operational");
assert(!isCynotechnicienFonction("secretaire"), "secretaire not operational");
assert(!isCynotechnicienFonction("assistant_technique"), "assistant not operational");
assert(!isCynotechnicienFonction("chef_materiel"), "chef matériel not operational");
assert(!isCynotechnicienFonction("aide_soignant_veterinaire"), "aide-soignant not operational");
assert(!isCynotechnicienFonction("chef_de_section"), "chef de section not operational");
assert(!isCynotechnicienFonction("chef_de_section_pi"), "chef de section PI not operational");

assert(isChefDeSectionFonction("chef_de_section"), "chef de section linked");
assert(isChefDeSectionFonction("chef_de_section_pi"), "chef de section PI linked");
assert(mayHaveSectionFonction("chef_de_section_pi"), "PI may have section");
assert(mayHaveSectionFonction("cynotechnicien"), "cyno may have section");
assert(!mayHaveSectionFonction("chef_brigadier"), "brigadier may not have section");
assert(!mayHaveSectionFonction("secretaire"), "secretaire may not have section");

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll personnel fonction hierarchy checks passed.");
