import type { RapportMessageDraft, RapportMessageExportLabels } from "@/lib/rapport-message/types";
import { escapeHtml, formatRapportMessageDate, splitBodyParagraphs } from "@/lib/rapport-message/format";

export function buildRapportMessagePreviewHtml(
  draft: RapportMessageDraft,
  labels: RapportMessageExportLabels,
): string {
  const paragraphs = splitBodyParagraphs(draft.body);
  const bodyHtml =
    paragraphs.length > 0
      ? paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
      : "<p>—</p>";
  const referenceRow = draft.reference.trim()
    ? `<div class="meta"><span>${escapeHtml(labels.reference)}</span><strong>${escapeHtml(draft.reference)}</strong></div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(labels.documentTitle)}</title>
<style>
  @page { size: A4; margin: 18mm 20mm; }
  body { margin: 0; background: #e5e7eb; color: #111; font-family: "Times New Roman", Times, serif; }
  .sheet {
    box-sizing: border-box;
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 22mm 20mm;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  }
  .brand { text-align: center; color: #023A84; font-family: Helvetica, Arial, sans-serif; }
  .brand h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: 0.04em; }
  .brand p { margin: 0; font-size: 11px; font-weight: 400; color: #334155; }
  .rule { border: 0; border-top: 2px solid #023A84; margin: 12px 0 18px; }
  h2 { text-align: center; font-family: Helvetica, Arial, sans-serif; color: #023A84; font-size: 20px; margin: 0 0 18px; letter-spacing: 0.08em; }
  .meta { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 13px; margin-bottom: 8px; }
  .meta span { color: #475569; font-family: Helvetica, Arial, sans-serif; font-size: 12px; }
  .body { margin-top: 18px; font-size: 13.5px; line-height: 1.65; text-align: justify; }
  .body p { margin: 0 0 10px; }
  .signature { margin-top: 36px; text-align: right; font-size: 13px; }
  .signature .label { font-family: Helvetica, Arial, sans-serif; font-weight: 700; margin-bottom: 6px; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 0; }
  }
</style></head><body>
  <article class="sheet">
    <header class="brand">
      <h1>${escapeHtml(labels.brand)}</h1>
      ${labels.unitName?.trim() ? `<p>${escapeHtml(labels.unitName.trim())}</p>` : ""}
    </header>
    <hr class="rule" />
    <h2>${escapeHtml(labels.documentTitle)}</h2>
    <div class="meta"><span>${escapeHtml(labels.date)}</span><strong>${escapeHtml(formatRapportMessageDate(draft.date))}</strong></div>
    <div class="meta"><span>${escapeHtml(labels.recipient)}</span><strong>${escapeHtml(draft.recipient.trim() || "—")}</strong></div>
    <div class="meta"><span>${escapeHtml(labels.sender)}</span><strong>${escapeHtml(draft.sender.trim() || "—")}</strong></div>
    ${referenceRow}
    <div class="meta"><span>${escapeHtml(labels.subject)}</span><strong>${escapeHtml(draft.title.trim() || "—")}</strong></div>
    <div class="body">${bodyHtml}</div>
    <div class="signature">
      <div class="label">${escapeHtml(labels.signature)}</div>
      <div>${escapeHtml(draft.signature.trim() || draft.sender.trim() || "—")}</div>
    </div>
  </article>
</body></html>`;
}

export function printRapportMessage(
  draft: RapportMessageDraft,
  labels: RapportMessageExportLabels,
): void {
  const html = buildRapportMessagePreviewHtml(draft, labels);
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
