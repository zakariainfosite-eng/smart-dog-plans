/**
 * Post-process OOXML produced by the `docx` npm package for Microsoft Word 2007.
 * Strips unsupported namespaces/attributes while preserving layout, tables, and images.
 */

import { toZipSafeUint8Array } from "@/lib/documents/docx-binary";

/** Namespace URIs valid in Word 2007 OOXML (.docx). */
const WORD2007_NAMESPACE_URIS: Readonly<Record<string, string>> = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  v: "urn:schemas-microsoft-com:vml",
  o: "urn:schemas-microsoft-com:office:office",
  w10: "urn:schemas-microsoft-com:office:word",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  cp: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
  dcmitype: "http://purl.org/dc/dcmitype/",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  vt: "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
};

/** Default namespace (no prefix) for package roots. */
const WORD2007_DEFAULT_ROOT_NS: Readonly<Record<string, string>> = {
  Types: "http://schemas.openxmlformats.org/package/2006/content-types",
  Relationships: "http://schemas.openxmlformats.org/package/2006/relationships",
  Properties: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
};

/** Prefixes introduced after Word 2007 — strip declarations and mc:Ignorable. */
const MODERN_ONLY_PREFIXES = new Set([
  "wpc",
  "w14",
  "w15",
  "w16",
  "w16cex",
  "w16cid",
  "w16sdtdh",
  "w16se",
  "wp14",
  "wpg",
  "wpi",
  "wps",
  "wne",
  "cx",
  "cx1",
  "cx2",
  "cx3",
  "cx4",
  "cx5",
  "cx6",
  "cx7",
  "cx8",
  "aink",
  "am3d",
]);

const XML_DECL =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function collectUsedPrefixes(xml: string): Set<string> {
  const prefixes = new Set<string>();

  for (const match of xml.matchAll(/<\/?([A-Za-z0-9]+):/g)) {
    const prefix = match[1];
    if (prefix !== "xmlns" && !MODERN_ONLY_PREFIXES.has(prefix)) {
      prefixes.add(prefix);
    }
  }

  // Relationship / schema prefixes appear on attributes (r:embed, r:id, xsi:type, …).
  for (const match of xml.matchAll(/(?:^|\s)(?!xmlns)([A-Za-z0-9]+):[A-Za-z0-9]+="/g)) {
    const prefix = match[1];
    if (!MODERN_ONLY_PREFIXES.has(prefix)) {
      prefixes.add(prefix);
    }
  }

  return prefixes;
}

function stripModernNamespaceDeclarations(attrs: string): string {
  return attrs.replace(/\s+xmlns:[A-Za-z0-9]+="[^"]*"/g, "").replace(/\s+xmlns="[^"]*"/g, "");
}

function rebuildXmlRootNamespaces(xml: string): string {
  const trimmed = xml.trim();
  const xmlDeclMatch = trimmed.match(/^<\?xml[^?]*\?>/);
  const xmlDecl = xmlDeclMatch?.[0] ?? XML_DECL;
  const content = xmlDeclMatch ? trimmed.slice(xmlDeclMatch[0].length).trimStart() : trimmed;

  const rootMatch = content.match(/^<([A-Za-z0-9._-]+(?::[A-Za-z0-9._-]+)?)([\s\S]*?)(\/?)>/);
  if (!rootMatch) return xml;

  const [, tagName, rawAttrs, selfClose] = rootMatch;
  const afterRoot = content.slice(rootMatch[0].length);
  const bareTag = tagName.includes(":") ? tagName.split(":")[1] : tagName;

  let keptAttrs = stripModernNamespaceDeclarations(rawAttrs)
    .replace(/\s+mc:Ignorable="[^"]*"/g, "")
    .trim();

  const usedPrefixes = collectUsedPrefixes(content);
  const xmlnsParts: string[] = [];

  const defaultNs = WORD2007_DEFAULT_ROOT_NS[bareTag];
  if (defaultNs) {
    xmlnsParts.push(`xmlns="${defaultNs}"`);
  }

  for (const prefix of [...usedPrefixes].sort()) {
    const uri = WORD2007_NAMESPACE_URIS[prefix];
    if (uri) {
      xmlnsParts.push(`xmlns:${prefix}="${uri}"`);
    }
  }

  const attrSegment = [keptAttrs, ...xmlnsParts].filter(Boolean).join(" ");
  const close = selfClose ? "/>" : ">";
  return `${xmlDecl}<${tagName}${attrSegment ? ` ${attrSegment}` : ""}${close}${afterRoot}`;
}

/**
 * Sanitize one OOXML part for Word 2007 (pure string transform — testable without JSZip).
 */
export function sanitizeWordXmlPart(xml: string, partPath = ""): string {
  let out = xml;

  // Word 2010+ — not understood by Word 2007.
  out = out.replace(/<w:displayBackgroundShape\s*\/>/g, "");

  // Office 2013+ drawing property.
  out = out.replace(/(<wp:docPr\b[^>]*)\s+title="[^"]*"/g, "$1");

  // Target Word 2007 compatibility mode (12).
  out = out.replace(
    /<w:compatSetting\s+w:val="\d+"\s+w:name="compatibilityMode"/g,
    '<w:compatSetting w:val="12" w:name="compatibilityMode"',
  );

  out = out.replace(/\s+mc:Ignorable="[^"]*"/g, "");

  if (/\.(xml|rels)$/i.test(partPath) || partPath === "") {
    out = rebuildXmlRootNamespaces(out);
  }

  return out;
}

export type Word2007ComplianceReport = {
  ok: boolean;
  issues: string[];
};

/** Inspect unzipped OOXML parts — used by tests and validation scripts. */
export function inspectWord2007DocxCompliance(
  parts: Readonly<Record<string, string>>,
): Word2007ComplianceReport {
  const issues: string[] = [];

  for (const [path, content] of Object.entries(parts)) {
    if (!/\.xml$/i.test(path)) continue;

    if (content.includes("displayBackgroundShape")) {
      issues.push(`${path}: contains w:displayBackgroundShape (Word 2010+)`);
    }
    if (/<wp:docPr\b[^>]*\stitle="/.test(content)) {
      issues.push(`${path}: wp:docPr title attribute (Office 2013+)`);
    }
    if (/xmlns:w1[4-9]=|xmlns:w16|xmlns:wp14=|xmlns:cx=|xmlns:aink=|xmlns:am3d=/.test(content)) {
      issues.push(`${path}: modern Word namespace declarations`);
    }
    if (/\smc:Ignorable="/.test(content)) {
      issues.push(`${path}: mc:Ignorable still present`);
    }
  }

  const settings = parts["word/settings.xml"];
  if (settings && !/w:val="12"\s+w:name="compatibilityMode"/.test(settings)) {
    issues.push("word/settings.xml: compatibilityMode is not 12 (Word 2007)");
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Re-pack a .docx buffer after sanitizing every XML / RELS part.
 * Safe to call on every export — idempotent for already-compatible files.
 */
export async function applyWord2007DocxCompatibility(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (!/\.(xml|rels)$/i.test(path)) continue;

    const original = await file.async("string");
    const sanitized = sanitizeWordXmlPart(original, path);
    if (sanitized !== original) {
      zip.file(path, sanitized);
    }
  }

  const packed = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return toZipSafeUint8Array(packed);
}
