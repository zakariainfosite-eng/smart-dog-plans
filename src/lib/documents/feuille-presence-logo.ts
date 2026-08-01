import type { jsPDF } from "jspdf";
import { GState, type ImageCompression } from "jspdf";

export type FeuillePresenceLogoAsset = {
  imageData: string | Uint8Array;
  format: "PNG" | "JPEG" | "WEBP";
  width: number;
  height: number;
};

export type FeuillePresenceLogoSources = {
  /** Original PNG bytes or data URL — reused for header seal and table watermark. */
  header?: string | Uint8Array;
};

export function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

export function buildFeuillePresenceLogoAsset(
  doc: jsPDF,
  imageData: string | Uint8Array,
  format?: "PNG" | "JPEG" | "WEBP",
): FeuillePresenceLogoAsset {
  const resolvedFormat =
    format ?? (typeof imageData === "string" ? imageFormatFromDataUrl(imageData) : "PNG");
  const props = doc.getImageProperties(imageData);
  return {
    imageData,
    format: resolvedFormat,
    width: props.width,
    height: props.height,
  };
}

/** Fit native pixels into a square box (mm) without stretching — object-fit: contain. */
export function fitLogoInSquareBox(
  imageWidth: number,
  imageHeight: number,
  boxSize: number,
): { w: number; h: number } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { w: boxSize, h: boxSize };
  }
  const aspect = imageWidth / imageHeight;
  if (aspect >= 1) {
    return { w: boxSize, h: boxSize / aspect };
  }
  return { w: boxSize * aspect, h: boxSize };
}

/** Largest square box (mm) centered in the table region — `areaFill` scales the shorter side. */
export function computeWatermarkBoxSize(
  regionW: number,
  regionH: number,
  areaFill: number,
): number {
  return Math.min(regionW, regionH) * areaFill;
}

/** Draw the official seal centered in a square box, preserving aspect ratio (no crop). */
export function drawFeuillePresenceLogoContained(
  doc: jsPDF,
  asset: FeuillePresenceLogoAsset,
  cx: number,
  cy: number,
  boxSize: number,
  options?: { opacity?: number; compression?: ImageCompression },
): void {
  const { w, h } = fitLogoInSquareBox(asset.width, asset.height, boxSize);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const compression = options?.compression ?? "NONE";

  if (options?.opacity != null) {
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: options.opacity }));
  }

  try {
    doc.addImage(asset.imageData, asset.format, x, y, w, h, undefined, compression);
  } finally {
    if (options?.opacity != null) {
      doc.restoreGraphicsState();
    }
  }
}
