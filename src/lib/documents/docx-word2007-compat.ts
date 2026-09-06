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

const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const EXTENDED_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
const CUSTOM_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties";

/** Default namespace (no prefix) for package roots — never guess `Properties` by tag name. */
const WORD2007_DEFAULT_ROOT_NS: Readonly<Record<string, string>> = {
  Types: CONTENT_TYPES_NS,
  Relationships: RELS_NS,
};

function normalizePartPath(partPath: string): string {
  return partPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function defaultNamespaceForPart(
  partPath: string,
  bareTag: string,
  originalDefaultNs: string | null,
): string | null {
  const path = normalizePartPath(partPath);
  if (path === "[Content_Types].xml" || bareTag === "Types") return CONTENT_TYPES_NS;
  if (path.endsWith(".rels") || bareTag === "Relationships") return RELS_NS;
  if (path === "docProps/custom.xml") return CUSTOM_PROPS_NS;
  if (path === "docProps/app.xml") return EXTENDED_PROPS_NS;
  if (originalDefaultNs) return originalDefaultNs;
  return WORD2007_DEFAULT_ROOT_NS[bareTag] ?? null;
}

/** Prefixes introduced after Word 2007 — strip declarations, attributes, and mc:Ignorable. */
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

const MODERN_PREFIX_PATTERN = [...MODERN_ONLY_PREFIXES].join("|");
const MODERN_ATTRIBUTE_RE = new RegExp(
  `\\s+(?:${MODERN_PREFIX_PATTERN}):[A-Za-z0-9]+="[^"]*"`,
  "g",
);

const XML_DECL =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function collectUsedPrefixes(xml: string): Set<string> {
  const prefixes = new Set<string>();

  for (const match of xml.matchAll(/<\/?([A-Za-z0-9]+):/g)) {
    const prefix = match[1];
    if (prefix !== "xmlns" && prefix !== "xml" && !MODERN_ONLY_PREFIXES.has(prefix)) {
      prefixes.add(prefix);
    }
  }

  // Relationship / schema prefixes appear on attributes (r:embed, r:id, xsi:type, …).
  for (const match of xml.matchAll(/(?:^|\s)(?!xmlns)([A-Za-z0-9]+):[A-Za-z0-9]+="/g)) {
    const prefix = match[1];
    if (prefix !== "xml" && !MODERN_ONLY_PREFIXES.has(prefix)) {
      prefixes.add(prefix);
    }
  }

  return prefixes;
}

function stripModernNamespaceDeclarations(attrs: string): string {
  return attrs.replace(/\s+xmlns:[A-Za-z0-9]+="[^"]*"/g, "").replace(/\s+xmlns="[^"]*"/g, "");
}

function rebuildXmlRootNamespaces(xml: string, partPath = ""): string {
  const trimmed = xml.trim();
  const xmlDeclMatch = trimmed.match(/^<\?xml[^?]*\?>/);
  const xmlDecl = xmlDeclMatch?.[0] ?? XML_DECL;
  const content = xmlDeclMatch ? trimmed.slice(xmlDeclMatch[0].length).trimStart() : trimmed;

  const rootMatch = content.match(/^<([A-Za-z0-9._-]+(?::[A-Za-z0-9._-]+)?)([\s\S]*?)(\/?)>/);
  if (!rootMatch) return xml;

  const [, tagName, rawAttrs, selfClose] = rootMatch;
  const afterRoot = content.slice(rootMatch[0].length);
  const bareTag = tagName.includes(":") ? tagName.split(":")[1]! : tagName;
  const originalDefaultNs = rawAttrs.match(/\sxmlns="([^"]*)"/)?.[1] ?? null;

  let keptAttrs = stripModernNamespaceDeclarations(rawAttrs)
    .replace(/\s+mc:Ignorable="[^"]*"/g, "")
    .trim();

  const usedPrefixes = collectUsedPrefixes(content);
  const xmlnsParts: string[] = [];

  const defaultNs = defaultNamespaceForPart(partPath, bareTag, originalDefaultNs);
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

function stripIllegalXmlChars(xml: string): string {
  return xml.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Word Android rejects W3CDTF timestamps that include milliseconds. */
function normalizeW3CdtfTimestamps(xml: string): string {
  return xml.replace(
    /(<(?:[A-Za-z0-9]+:)?(?:created|modified)\b[^>]*>)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z(<\/)/g,
    "$1$2Z$3",
  );
}

function ensureRequiredWordStyles(xml: string): string {
  if (!xml.includes("<w:styles")) return xml;
  let out = xml;
  if (!/w:styleId="Normal"/.test(out)) {
    const normal =
      '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:qFormat/></w:style>';
    out = out.includes("</w:docDefaults>")
      ? out.replace("</w:docDefaults>", `</w:docDefaults>${normal}`)
      : out.replace(/<w:styles\b[^>]*>/, (open) => `${open}${normal}`);
  }
  if (!/w:styleId="DefaultParagraphFont"/.test(out)) {
    const def =
      '<w:style w:type="character" w:styleId="DefaultParagraphFont" w:default="1"><w:name w:val="Default Paragraph Font"/><w:semiHidden/><w:unhideWhenUsed/></w:style>';
    out = out.replace(
      /(<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>)/,
      `$1${def}`,
    );
  }
  return out;
}

function replaceEmptyOrOpenRoot(
  xml: string,
  rootLocalName: string,
  inner: string,
): string {
  const empty = new RegExp(`<(${rootLocalName})(\\b[^>]*)\\/>`);
  if (empty.test(xml)) {
    return xml.replace(empty, `<$1$2>${inner}</$1>`);
  }
  const open = new RegExp(`<(${rootLocalName})(\\b[^>]*)>`);
  return xml.replace(open, `<$1$2>${inner}`);
}

/** Word Android repairs an empty font table when the document names fonts. */
function ensureRequiredFonts(xml: string): string {
  if (!xml.includes("<w:fonts") || /<w:font\b/.test(xml)) return xml;
  const fonts =
    '<w:font w:name="Times New Roman"><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>' +
    '<w:font w:name="Arial"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>';
  return replaceEmptyOrOpenRoot(xml, "w:fonts", fonts);
}

/** Empty extended-properties part is invalid for Word's document inspector. */
function ensureAppProperties(xml: string): string {
  if (!xml.includes("<Properties") || /<Application[\s>]/.test(xml)) return xml;
  const children =
    "<Application>Microsoft Office Word</Application><AppVersion>12.0000</AppVersion>";
  return replaceEmptyOrOpenRoot(xml, "Properties", children);
}

function isEmptyCustomProperties(xml: string): boolean {
  return xml.includes("<Properties") && !/<property[\s>/]/i.test(xml);
}

function dropEmptyCustomPropertiesPart(parts: Record<string, string>): void {
  const custom = parts["docProps/custom.xml"];
  if (!custom || !isEmptyCustomProperties(custom)) return;
  delete parts["docProps/custom.xml"];

  const types = parts["[Content_Types].xml"];
  if (types) {
    parts["[Content_Types].xml"] = types.replace(
      /<Override\b[^>]*PartName="\/docProps\/custom\.xml"[^>]*\/>/g,
      "",
    );
  }
  const rels = parts["_rels/.rels"];
  if (rels) {
    parts["_rels/.rels"] = rels.replace(
      /<Relationship\b[^>]*Target="docProps\/custom\.xml"[^>]*\/>/g,
      "",
    );
  }
}

/**
 * Sanitize one OOXML part for Word 2007 (pure string transform — testable without JSZip).
 */
export function sanitizeWordXmlPart(xml: string, partPath = ""): string {
  let out = stripIllegalXmlChars(xml);
  const path = normalizePartPath(partPath);

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
  out = out.replace(MODERN_ATTRIBUTE_RE, "");
  out = normalizeW3CdtfTimestamps(out);

  if (path === "word/styles.xml" || (path === "" && out.includes("<w:styles"))) {
    out = ensureRequiredWordStyles(out);
  }
  if (path === "word/fontTable.xml" || (path === "" && out.includes("<w:fonts"))) {
    out = ensureRequiredFonts(out);
  }
  if (path === "docProps/app.xml") {
    out = ensureAppProperties(out);
  }

  if (/\.(xml|rels)$/i.test(path) || path === "") {
    out = rebuildXmlRootNamespaces(out, path);
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

  const custom = parts["docProps/custom.xml"];
  if (custom?.includes(EXTENDED_PROPS_NS) && !custom.includes(CUSTOM_PROPS_NS)) {
    issues.push("docProps/custom.xml: wrong root namespace (extended-properties)");
  }

  const core = parts["docProps/core.xml"];
  if (core && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/.test(core)) {
    issues.push("docProps/core.xml: W3CDTF timestamp includes milliseconds");
  }

  const styles = parts["word/styles.xml"];
  if (styles && !/w:styleId="Normal"/.test(styles)) {
    issues.push("word/styles.xml: missing required Normal style");
  }

  const fonts = parts["word/fontTable.xml"];
  if (fonts && !/<w:font\b/.test(fonts)) {
    issues.push("word/fontTable.xml: empty font table");
  }

  const app = parts["docProps/app.xml"];
  if (app && !/<Application[\s>]/.test(app)) {
    issues.push("docProps/app.xml: missing Application");
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Re-pack a .docx as a Word-Android-safe OOXML ZIP:
 * files only (no directory entries), DOS platform, DEFLATE, sanitized XML.
 * Safe to call on every export — idempotent for already-compatible files.
 */
export async function applyWord2007DocxCompatibility(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const source = await JSZip.loadAsync(bytes);
  const out = new JSZip();
  const xmlParts: Record<string, string> = {};
  const binaryParts: Record<string, Uint8Array> = {};

  for (const [path, file] of Object.entries(source.files)) {
    if (file.dir) continue;

    if (/\.(xml|rels)$/i.test(path)) {
      xmlParts[path] = sanitizeWordXmlPart(await file.async("string"), path);
    } else {
      binaryParts[path] = toZipSafeUint8Array(await file.async("uint8array"));
    }
  }

  dropEmptyCustomPropertiesPart(xmlParts);

  for (const [path, xml] of Object.entries(xmlParts)) {
    out.file(path, xml, { createFolders: false });
  }
  for (const [path, data] of Object.entries(binaryParts)) {
    out.file(path, data, { createFolders: false });
  }

  for (const [path, file] of Object.entries(out.files)) {
    if (file.dir) delete out.files[path];
  }

  const packed = await out.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
    streamFiles: false,
  });

  return toZipSafeUint8Array(packed);
}

function collectUndeclaredPrefixes(xml: string): string[] {
  const declared = new Set(
    [...xml.matchAll(/\sxmlns:([A-Za-z0-9]+)="/g)].map((match) => match[1]),
  );
  const used = new Set<string>();
  for (const match of xml.matchAll(/<\/?([A-Za-z0-9]+):/g)) {
    const prefix = match[1];
    if (prefix !== "xmlns" && prefix !== "xml") used.add(prefix);
  }
  for (const match of xml.matchAll(/(?:^|[\s<])(?!xmlns)([A-Za-z0-9]+):[A-Za-z0-9.-]+="/g)) {
    const prefix = match[1];
    if (prefix !== "xml") used.add(prefix);
  }
  return [...used].filter((prefix) => !declared.has(prefix)).sort();
}

/**
 * Structural OOXML checks Word Android uses before offering "contenu illisible".
 */
export async function validateWordCompatibleDocx(
  bytes: Uint8Array,
): Promise<Word2007ComplianceReport> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const parts: Record<string, string> = {};
  const fileNames = new Set<string>();

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    fileNames.add(path);
    if (/\.(xml|rels)$/i.test(path)) {
      parts[path] = await file.async("string");
    }
  }

  const issues = [...inspectWord2007DocxCompliance(parts).issues];

  for (const [path, xml] of Object.entries(parts)) {
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) {
      issues.push(`${path}: illegal XML characters`);
    }
    const undeclared = collectUndeclaredPrefixes(xml);
    if (undeclared.length > 0) {
      issues.push(`${path}: undeclared prefixes (${undeclared.join(", ")})`);
    }
  }

  for (const [path, xml] of Object.entries(parts)) {
    if (!path.endsWith(".rels")) continue;
    const baseDir = path.replace(/_rels\/[^/]+$/, "");
    const ids = [...xml.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1]);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      issues.push(`${path}: duplicate relationship IDs`);
    }
    for (const match of xml.matchAll(/\bTarget="([^"]+)"/g)) {
      const target = match[1];
      if (/^https?:\/\//i.test(target) || target.startsWith("mailto:")) continue;
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : `${baseDir}${target}`.replace(/\/{2,}/g, "/");
      if (!fileNames.has(resolved)) {
        issues.push(`${path}: missing target ${target}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
