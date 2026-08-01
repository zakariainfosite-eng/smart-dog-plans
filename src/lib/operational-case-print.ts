import type { TFunction } from "i18next";
import type { OperationalCaseWithRelations } from "@/lib/operational-case-api";
import {
  caseObjectLabel,
  caseQuantityDisplay,
  caseSpecialtyLabel,
  caseStatusLabel,
  caseDisplayStatus,
  formatCaseSummary,
} from "@/lib/operational-cases";
import { checkpointLabel } from "@/lib/operational-case-api";

export function printOperationalCase(caseRow: OperationalCaseWithRelations, t: TFunction) {
  const agent = caseRow.agent;
  const dog = caseRow.dog;
  const qty = caseQuantityDisplay(caseRow, t);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${caseRow.case_number}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; color: #111; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin-bottom: 4px; }
  .meta { color: #666; font-size: 0.875rem; margin-bottom: 24px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; font-size: 0.9rem; }
  dt { color: #666; }
  dd { margin: 0; font-weight: 500; }
</style></head><body>
  <h1>${caseRow.case_number}</h1>
  <p class="meta">${caseRow.case_date} · ${caseSpecialtyLabel(caseRow.specialty, t)} · ${caseStatusLabel(caseDisplayStatus(caseRow), t)}</p>
  <dl>
    <dt>${t("operationalCases.table.agent")}</dt><dd>${agent ? `${agent.first_name} ${agent.last_name} (${agent.professional_number})` : "—"}</dd>
    <dt>${t("operationalCases.table.dog")}</dt><dd>${dog?.name ?? "—"}</dd>
    <dt>${t("operationalCases.table.checkpoint")}</dt><dd>${checkpointLabel(caseRow)}</dd>
    <dt>${t("operationalCases.table.seizureType")}</dt><dd>${caseObjectLabel(caseRow, t)}</dd>
    <dt>${t("operationalCases.table.quantity")}</dt><dd>${qty.quantity}${qty.threat ? ` · ${qty.threat}` : ""}</dd>
    <dt>${t("operationalCases.field.observations")}</dt><dd>${caseRow.observations?.trim() || "—"}</dd>
  </dl>
  <p style="margin-top:24px;font-size:0.8rem;color:#999">${formatCaseSummary(caseRow, t)}</p>
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
