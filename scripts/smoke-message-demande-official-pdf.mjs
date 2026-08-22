/**
 * Smoke: Message/Demande official layout (fixed destinataire + vertical signatures).
 * Run: node scripts/smoke-message-demande-official-pdf.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "tmp");
mkdirSync(outDir, { recursive: true });

const A4 = {
  width: 210,
  height: 297,
  marginTop: 14,
  marginBottom: 16,
  marginLeft: 16,
  marginRight: 16,
};
const contentWidth = () => A4.width - A4.marginLeft - A4.marginRight;

const EXPEDITEUR =
  "PP/ DISTRICT DU PORT MARITIME DE TANGER MED  BPJ/ NBPCYN NR";
const RECIPIENT_LINES = [
  { left: "DESTINATAIRE : DGSN/DPJ/DPC/SSV", right: "RABAT" },
  { left: "PI" },
  { left: "DGSN/DPJ/SEC" },
  { left: "DGSN/DPJ/DPC/SEC" },
  { left: "PP SPPJ - SAP", right: "TANGER" },
  { left: "CHEF AA TANGER-VILLE." },
];

const SIGNATORIES = [
  { endorsement: "SIGNÉ", fullName: "FAHD BEN ABDELGHAFOUR", functionTitle: "CHEF BPCYN-PI" },
  { endorsement: "VU", fullName: "MOHAMMED FARASSI", functionTitle: "CHEF BPJ" },
  { endorsement: "VU", fullName: "MOULAY ISMAIL SAAD EL IDRISSI", functionTitle: "CHEF DPM" },
  { endorsement: "VU", fullName: "ABDELKEBIR FARAH", functionTitle: "PP-TANGER" },
];

function setFont(doc, style, size) {
  doc.setFont("times", style);
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
}

function render() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const left = A4.marginLeft;
  const right = A4.width - A4.marginRight;
  let y = A4.marginTop;

  setFont(doc, "bold", 11);
  doc.text("DIRECTION GENERALE", left, y);
  y += 5;
  doc.text("DE LA SURETE NATIONALE", left, y);
  y += 7;
  setFont(doc, "bold", 12);
  doc.text("RADIO DEPART", A4.width / 2, y, { align: "center" });
  y += 10;

  // correspondence
  setFont(doc, "bold", 10);
  const expLabel = "EXPEDITEUR : ";
  doc.text(expLabel, left, y);
  setFont(doc, "normal", 10);
  doc.text(EXPEDITEUR, left + doc.getTextWidth(expLabel), y);
  y += 6.5;

  for (const line of RECIPIENT_LINES) {
    setFont(doc, "normal", 10);
    doc.text(line.left, left, y);
    if (line.right) {
      setFont(doc, "bold", 10);
      doc.text(line.right, right, y, { align: "right" });
    }
    y += 4.6;
  }
  y += 8;

  setFont(doc, "bold", 11);
  doc.text("URGENT", A4.width / 2, y, { align: "center" });
  y += 8;
  setFont(doc, "bold", 10);
  doc.text("OBJET : Demande de matériel cynotechnique", left, y);
  y += 6;
  setFont(doc, "normal", 10);
  const body = doc.splitTextToSize(
    "J'ai l'honneur de vous adresser la présente demande relative à l'équipement de la brigade canine.",
    contentWidth(),
  );
  doc.text(body, left, y);
  y += body.length * 4.5 + 12;

  // vertical signatures
  for (const sig of SIGNATORIES) {
    const leftText = `${sig.endorsement} / ${sig.fullName}`;
    setFont(doc, "bold", 10);
    doc.text(leftText, left, y, { maxWidth: contentWidth() * 0.58 });
    setFont(doc, "bold", 9.5);
    doc.text(sig.functionTitle, right, y, { align: "right" });
    y += 7.5;
  }

  const out = join(outDir, "message-demande-4-signatures.pdf");
  writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
  console.log("Wrote", out);
  console.log("page=", doc.internal.pageSize.getWidth(), "x", doc.internal.pageSize.getHeight());
  console.log("expediteur fixed=", EXPEDITEUR.slice(0, 40) + "…");
  console.log("recipient lines=", RECIPIENT_LINES.length, "(RABAT/TANGER right-aligned)");
  console.log("signatures vertical=", SIGNATORIES.length);
}

render();
