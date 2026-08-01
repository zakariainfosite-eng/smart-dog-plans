type ProfileSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export function buildAgentProfilePrintDocument(
  title: string,
  sections: ProfileSection[],
): string {
  const sectionHtml = sections
    .map(
      (section) => `
      <section style="margin-bottom:24px;">
        <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin:0 0 12px;">${section.title}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${section.rows
            .map(
              (row) => `
            <tr>
              <td style="padding:8px 12px 8px 0;color:#64748b;width:38%;vertical-align:top;">${row.label}</td>
              <td style="padding:8px 0;font-weight:500;color:#111827;vertical-align:top;">${row.value}</td>
            </tr>`,
            )
            .join("")}
        </table>
      </section>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 32px; color: #111827; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 28px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="subtitle">CynoPlanning — ${new Date().toLocaleDateString("fr-FR")}</p>
  ${sectionHtml}
</body>
</html>`;
}

export function openAgentProfilePrintWindow(html: string, mode: "print" | "pdf") {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
    if (mode === "print") {
      printWindow.onafterprint = () => printWindow.close();
    }
  };
}

export function downloadAgentProfileHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}
