import { describe, expect, it } from "vitest";

import { assertDocxZipIntegrity } from "@/lib/documents/docx-binary";
import { generateRapportMessageDocx } from "@/lib/rapport-message/docx";

describe("rapport-message DOCX export", () => {
  it("generates a real OOXML package openable as .docx", async () => {
    const bytes = await generateRapportMessageDocx(
      {
        title: "Demande de renfort",
        date: "2026-08-23",
        recipient: "Monsieur le Commandant",
        sender: "Chef de brigade",
        reference: "MSG-2026-12",
        body: "Premier paragraphe.\n\nDeuxième paragraphe avec suite.",
        signature: "Le chef de brigade",
      },
      {
        brand: "CynoPlanning",
        documentTitle: "RAPPORT / MESSAGE",
        date: "Date",
        recipient: "Destinataire",
        sender: "Expéditeur",
        reference: "Référence",
        subject: "Objet / Titre",
        signature: "Signature",
        unitName: "Brigade cynotechnique",
      },
    );

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    await assertDocxZipIntegrity(bytes, "rapport-message-test");

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toBeTruthy();
    expect(documentXml).toContain("RAPPORT / MESSAGE");
    expect(documentXml).toContain("Demande de renfort");
    expect(documentXml).toContain("Premier paragraphe");
    expect(documentXml).toContain("Deuxième paragraphe");
    expect(documentXml).toContain("Le chef de brigade");
  });
});
