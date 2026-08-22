/**
 * Smoke check: build OfficialDocumentModel + render A4 PDF without UI.
 * Run: node --experimental-vm-modules scripts/smoke-sick-dog-official-pdf.mjs
 * (or via tsx if available)
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

const A4 = { width: 210, height: 297, marginTop: 14, marginBottom: 16, marginLeft: 16, marginRight: 16 };
const contentWidth = () => A4.width - A4.marginLeft - A4.marginRight;
const contentBottom = () => A4.height - A4.marginBottom;

function setFont(doc, style, size) {
  doc.setFont("times", style);
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
}

function buildModel({ longMessage = false, urgent = true, emptyOptional = false } = {}) {
  const long =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(80) +
    "\n\nDeuxième paragraphe.\nTroisième ligne.";
  return {
    kind: "sick_dog_report",
    header: {
      agencyLines: ["DIRECTION GENERALE", "DE LA SURETE NATIONALE"],
      radioTitle: "RADIO DEPART",
    },
    table: {
      origin: "UC CANINE",
      number: "42/2026",
      words: "120",
      departureDateTime: "2026-08-19 09:30",
      serviceMention: "Service",
    },
    correspondence: {
      sender: "Chef de section",
      to: "Commandant de la compagnie",
      recipient: "Commandant de la compagnie",
      city: "CASABLANCA",
      diffusion: emptyOptional ? [] : ["DGSN", "Archives"],
    },
    priority: urgent ? "URGENT" : "NORMAL",
    body: {
      subject: "RAPPORT DE CHIEN MALADE",
      facts: emptyOptional
        ? [{ label: "Nom du chien", value: "Rex" }]
        : [
            { label: "Nom du chien", value: "Rex" },
            { label: "Spécialité", value: "Explosifs" },
            { label: "Cynotechnicien assigné", value: "Ali Benali" },
            { label: "Date d'examen", value: "2026-08-18" },
            { label: "Vétérinaire", value: "Dr. Karim" },
            { label: "Diagnostic / constat", value: "Boiterie légère" },
            { label: "Traitement prescrit", value: "Repos + anti-inflammatoire" },
            { label: "Durée de repos", value: "7 jours" },
          ],
      messageBody: longMessage
        ? long
        : "Le chien Rex présente une boiterie suite à un examen vétérinaire.\nRepos prescrit pour 7 jours.",
    },
    signatories: [
      { fullName: "Ali Benali", functionTitle: "Chef de section" },
      { fullName: "Sara Amrani", functionTitle: "Aide-soignant vétérinaire" },
    ],
  };
}

function render(model) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = A4.marginTop;
  const left = A4.marginLeft;
  const right = A4.width - A4.marginRight;

  setFont(doc, "bold", 9);
  model.header.agencyLines.forEach((line, i) => doc.text(line, left, y + i * 4.2));
  setFont(doc, "bold", 12);
  doc.text(model.header.radioTitle, right, y + 2, { align: "right" });
  y += 14;

  // table
  const totalW = contentWidth();
  const cols = [
    ["Origine", model.table.origin, 0.16],
    ["Numéro", model.table.number, 0.14],
    ["Mots", model.table.words, 0.1],
    ["Date et heure de départ", model.table.departureDateTime, 0.34],
    ["Mention de servi", model.table.serviceMention, 0.26],
  ];
  const headerH = 7;
  const valueH = 10;
  doc.setDrawColor(0, 0, 0);
  doc.rect(left, y, totalW, headerH + valueH);
  let x = left;
  for (const [label, value, ratio] of cols) {
    const w = totalW * ratio;
    doc.line(x, y, x, y + headerH + valueH);
    doc.line(x, y + headerH, x + w, y + headerH);
    setFont(doc, "bold", 7);
    doc.text(label, x + w / 2, y + 4.5, { align: "center", maxWidth: w - 1.5 });
    setFont(doc, "normal", 9);
    doc.text(value, x + w / 2, y + headerH + 6, { align: "center", maxWidth: w - 2 });
    x += w;
  }
  y += headerH + valueH + 6;

  setFont(doc, "bold", 10);
  doc.text(`EXPEDITEUR : ${model.correspondence.sender}`, left, y);
  y += 5;
  doc.text(`A : ${model.correspondence.to}`, left, y);
  y += 5;
  doc.text(`DESTINATAIRE : ${model.correspondence.recipient}`, left, y);
  y += 5;
  if (model.correspondence.city) {
    doc.text(model.correspondence.city, left, y);
    y += 5;
  }

  if (model.priority === "URGENT") {
    y += 3;
    setFont(doc, "bold", 14);
    doc.text("U R G E N T", A4.width / 2, y, { align: "center" });
    y += 6;
  }

  setFont(doc, "bold", 11);
  doc.text(model.body.subject, A4.width / 2, y, { align: "center" });
  y += 7;

  for (const fact of model.body.facts) {
    setFont(doc, "normal", 9);
    const lines = doc.splitTextToSize(`${fact.label} : ${fact.value}`, totalW);
    if (y + lines.length * 4 > contentBottom()) {
      doc.addPage();
      y = A4.marginTop;
    }
    doc.text(lines, left, y);
    y += lines.length * 4 + 1;
  }

  y += 3;
  setFont(doc, "normal", 11);
  for (const paragraph of model.body.messageBody.split(/\n/)) {
    const lines = paragraph === "" ? [""] : doc.splitTextToSize(paragraph, totalW);
    for (const line of lines) {
      if (y + 4.6 > contentBottom()) {
        doc.addPage();
        y = A4.marginTop + 8;
        setFont(doc, "bold", 9);
        doc.text(`${model.body.subject} (suite)`, A4.width / 2, A4.marginTop, { align: "center" });
        setFont(doc, "normal", 11);
      }
      if (line) doc.text(line, left, y);
      y += 4.6;
    }
  }

  y += 10;
  if (y + 28 > contentBottom()) {
    doc.addPage();
    y = A4.marginTop + 10;
  }
  model.signatories.forEach((sig, i) => {
    const cx = left + (i % 2) * (totalW / 2) + totalW / 4;
    const sy = y + Math.floor(i / 2) * 28;
    setFont(doc, "bold", 10);
    doc.text(sig.fullName.toUpperCase(), cx, sy, { align: "center" });
    setFont(doc, "normal", 9);
    doc.text(sig.functionTitle, cx, sy + 5, { align: "center" });
  });

  return doc;
}

const cases = [
  { name: "full", opts: {} },
  { name: "long", opts: { longMessage: true } },
  { name: "empty-optional", opts: { emptyOptional: true, urgent: false } },
];

for (const c of cases) {
  const model = buildModel(c.opts);
  const doc = render(model);
  const out = join(outDir, `sick-dog-${c.name}.pdf`);
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(out, buf);
  console.log(`${c.name}: pages=${doc.getNumberOfPages()} bytes=${buf.length} -> ${out}`);
  if (c.name === "long" && doc.getNumberOfPages() < 2) {
    throw new Error("Expected long message to paginate");
  }
  if (c.name === "empty-optional" && model.priority === "URGENT") {
    throw new Error("NORMAL must not be urgent");
  }
}

console.log("smoke-sick-dog-official-pdf: OK");
