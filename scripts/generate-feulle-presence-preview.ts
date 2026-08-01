/**
 * Regenerate blank template preview PDF with official logo.
 * Usage: npx tsx scripts/generate-feulle-presence-preview.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { renderFeuillePresencePage } from "../src/lib/documents/feuille-presence-render.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "public/assets/police-cynotechnique-logo.png");
const outPath = join(root, "public/previews/feuille-presence-template-preview.pdf");

const logoBytes = new Uint8Array(readFileSync(logoPath));

const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
renderFeuillePresencePage(doc, 2026, { header: logoBytes });
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log(`Preview: ${outPath}`);
