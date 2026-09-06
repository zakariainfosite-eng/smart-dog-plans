import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertDocxZipIntegrity, listZipCentralDirectoryNames } from "@/lib/documents/docx-binary";
import { validateWordCompatibleDocx } from "@/lib/documents/docx-word2007-compat";
import { generateFeuillePresenceDocx } from "@/lib/documents/feuille-presence-docx";
import type { FeuillePresenceData } from "@/lib/documents/feuille-presence-types";

const SAMPLE_DATA: FeuillePresenceData = {
  dateLine: "TANGER LE 03 / 10 / 2026",
  sectionName: "SECTION 1",
  chefName: "EL AMRANI HASSAN",
  chefGrade: "BRIGADIER",
  chefMle: "12345",
  chefMode: "chief",
  narcoticsRows: [
    {
      fullName: "BENALI KARIM",
      grade: "GENDARME",
      mle: "10001",
      dogName: "REX",
      hour: "08:00",
      assignment: "P1",
      signature: "",
    },
  ],
  explosivesRows: [
    {
      fullName: "TAZI YOUSSEF",
      grade: "GENDARME",
      mle: "10002",
      dogName: "IRA",
      hour: "08:00",
      assignment: "P2",
      signature: "",
    },
  ],
};

describe("feuille de présence DOCX package", () => {
  it("generates a standard OOXML ZIP that Word Android can open", async () => {
    const bytes = await generateFeuillePresenceDocx(SAMPLE_DATA, { logoBytes: undefined });

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    await assertDocxZipIntegrity(bytes, "feuille-presence-docx-test");

    const names = listZipCentralDirectoryNames(bytes);
    expect(names.some((name) => name.endsWith("/"))).toBe(false);
    expect(names).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
    );

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
    const rels = await zip.file("_rels/.rels")?.async("string");
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(contentTypes).toContain("word/document.xml");
    expect(rels).toContain("word/document.xml");
    expect(documentXml).toContain("FEUILLE DE PRESENCE");
    expect(documentXml).not.toContain("wp14:");
    expect(documentXml).not.toContain("mc:Ignorable");

    const customXml = await zip.file("docProps/custom.xml")?.async("string");
    const appXml = await zip.file("docProps/app.xml")?.async("string");
    const coreXml = await zip.file("docProps/core.xml")?.async("string");
    const stylesXml = await zip.file("word/styles.xml")?.async("string");
    const fontsXml = await zip.file("word/fontTable.xml")?.async("string");
    if (customXml) {
      expect(customXml).toContain(
        "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
      );
      expect(customXml).not.toContain(
        "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
      );
    }
    expect(appXml).toContain("<Application>");
    expect(coreXml).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/);
    expect(stylesXml).toContain('w:styleId="Normal"');
    expect(fontsXml).toContain('w:name="Times New Roman"');

    const report = await validateWordCompatibleDocx(bytes);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("writes Planning_2026-09-06.docx as a finalized OOXML package", async () => {
    const bytes = await generateFeuillePresenceDocx(SAMPLE_DATA, { logoBytes: undefined });
    await assertDocxZipIntegrity(bytes, "Planning_2026-09-06.docx");
    const report = await validateWordCompatibleDocx(bytes);
    expect(report.ok).toBe(true);
    const outPath = resolve(process.cwd(), "Planning_2026-09-06.docx");
    writeFileSync(outPath, bytes);
    expect(listZipCentralDirectoryNames(bytes)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
    );
  });
});
