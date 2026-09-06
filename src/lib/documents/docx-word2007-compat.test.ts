import { describe, expect, it } from "vitest";

import {
  applyWord2007DocxCompatibility,
  inspectWord2007DocxCompliance,
  sanitizeWordXmlPart,
} from "@/lib/documents/docx-word2007-compat";
import { assertDocxZipIntegrity, listZipCentralDirectoryNames } from "@/lib/documents/docx-binary";

const MODERN_SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings mc:Ignorable="w14 w15 wp14" xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"><w:displayBackgroundShape/><w:compat><w:compatSetting w:val="15" w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word"/></w:compat></w:settings>`;

const MODERN_COMMENTS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable="w16 cx"/>`;

describe("sanitizeWordXmlPart", () => {
  it("removes Word 2010 displayBackgroundShape and sets compatibility mode 12", () => {
    const out = sanitizeWordXmlPart(MODERN_SETTINGS, "word/settings.xml");
    expect(out).not.toContain("displayBackgroundShape");
    expect(out).toContain('w:val="12" w:name="compatibilityMode"');
    expect(out).not.toContain("xmlns:w14=");
    expect(out).not.toContain("mc:Ignorable");
  });

  it("strips modern namespaces from empty comments part", () => {
    const out = sanitizeWordXmlPart(MODERN_COMMENTS, "word/comments.xml");
    expect(out).not.toContain("xmlns:w16=");
    expect(out).not.toContain("xmlns:cx=");
    expect(out).toContain('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"');
  });

  it("keeps custom-properties namespace on docProps/custom.xml", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>';
    const out = sanitizeWordXmlPart(xml, "docProps/custom.xml");
    expect(out).toContain(
      'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"',
    );
    expect(out).not.toContain(
      'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    );
  });

  it("keeps extended-properties namespace on docProps/app.xml", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>';
    const out = sanitizeWordXmlPart(xml, "docProps/app.xml");
    expect(out).toContain(
      'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    );
  });

  it("strips milliseconds from W3CDTF core timestamps", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/"><dcterms:created xsi:type="dcterms:W3CDTF">2026-09-06T16:55:38.401Z</dcterms:created></cp:coreProperties>';
    const out = sanitizeWordXmlPart(xml, "docProps/core.xml");
    expect(out).toContain(">2026-09-06T16:55:38Z</");
    expect(out).not.toContain(".401Z");
  });

  it("injects required fonts into an empty font table", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';
    const out = sanitizeWordXmlPart(xml, "word/fontTable.xml");
    expect(out).toContain('w:name="Times New Roman"');
    expect(out).toContain('w:name="Arial"');
  });

  it("injects Application into empty extended properties", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>';
    const out = sanitizeWordXmlPart(xml, "docProps/app.xml");
    expect(out).toContain("<Application>Microsoft Office Word</Application>");
    expect(out).toContain(
      'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
    );
  });

  it("injects required Normal style", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault/><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style></w:styles>';
    const out = sanitizeWordXmlPart(xml, "word/styles.xml");
    expect(out).toContain('w:styleId="Normal"');
    expect(out).toContain('w:styleId="DefaultParagraphFont"');
  });

  it("strips Word 2010+ prefixed attributes so XML stays valid", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"><wp:anchor wp14:anchorId="1A2B"/></w:document>';
    const out = sanitizeWordXmlPart(xml, "word/document.xml");
    expect(out).not.toContain("wp14:");
    expect(out).not.toContain("xmlns:wp14=");
  });

  it("removes Office 2013 title attribute from wp:docPr", () => {
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="logo" descr="Seal" title="Police"/></w:document>';
    const out = sanitizeWordXmlPart(xml, "word/document.xml");
    expect(out).not.toContain('title="Police"');
    expect(out).toContain('name="logo"');
  });

  it("keeps r namespace when images use r:embed attributes", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><a:blip r:embed="rId8"/></w:body></w:document>';
    const out = sanitizeWordXmlPart(xml, "word/document.xml");
    expect(out).toContain('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  });
});

describe("inspectWord2007DocxCompliance", () => {
  it("passes when all parts are Word 2007 safe", () => {
    const settings = sanitizeWordXmlPart(MODERN_SETTINGS, "word/settings.xml");
    const comments = sanitizeWordXmlPart(MODERN_COMMENTS, "word/comments.xml");
    const report = inspectWord2007DocxCompliance({
      "word/settings.xml": settings,
      "word/comments.xml": comments,
    });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("flags modern settings that were not sanitized", () => {
    const report = inspectWord2007DocxCompliance({
      "word/settings.xml": MODERN_SETTINGS,
    });
    expect(report.ok).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});

describe("applyWord2007DocxCompatibility", () => {
  it("repacks a DOCX without ZIP directory entries and keeps required OOXML parts", async () => {
    const { default: JSZip } = await import("jszip");
    const source = new JSZip();
    source.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    source.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    source.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"><w:body><w:p wp14:anchorId="ABCD"><w:r><w:t>Planning</w:t></w:r></w:p></w:body></w:document>',
    );
    const withFolders = await source.generateAsync({ type: "uint8array" });
    expect(listZipCentralDirectoryNames(withFolders).some((name) => name.endsWith("/"))).toBe(true);

    const packed = await applyWord2007DocxCompatibility(withFolders);
    await assertDocxZipIntegrity(packed, "word2007-repack-test");
    const names = listZipCentralDirectoryNames(packed);
    expect(names.some((name) => name.endsWith("/"))).toBe(false);
    expect(names).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]),
    );

    const zip = await JSZip.loadAsync(packed);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Planning");
    expect(documentXml).not.toContain("wp14:");
  });

  it("drops an empty custom-properties part that Word Android treats as unreadable", async () => {
    const { default: JSZip } = await import("jszip");
    const source = new JSZip();
    source.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>',
    );
    source.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>',
    );
    source.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Planning</w:t></w:r></w:p></w:body></w:document>',
    );
    source.file(
      "docProps/custom.xml",
      '<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>',
    );
    const packed = await applyWord2007DocxCompatibility(
      await source.generateAsync({ type: "uint8array" }),
    );
    const zip = await JSZip.loadAsync(packed);
    expect(zip.file("docProps/custom.xml")).toBeNull();
    const types = await zip.file("[Content_Types].xml")?.async("string");
    const rels = await zip.file("_rels/.rels")?.async("string");
    expect(types).not.toContain("/docProps/custom.xml");
    expect(rels).not.toContain("docProps/custom.xml");
  });
});
