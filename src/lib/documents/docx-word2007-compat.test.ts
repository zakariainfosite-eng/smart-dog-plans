import { describe, expect, it } from "vitest";

import {
  inspectWord2007DocxCompliance,
  sanitizeWordXmlPart,
} from "@/lib/documents/docx-word2007-compat";

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
