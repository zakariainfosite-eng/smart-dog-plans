/** A4 layout constants for official Radio Départ documents (mm). */
export const A4 = {
  width: 210,
  height: 297,
  marginTop: 14,
  marginBottom: 16,
  marginLeft: 16,
  marginRight: 16,
} as const;

/**
 * Message / Demande vertical signatures — shared by A4 preview and PDF.
 * Name and function sit on one line with ~3 spaces between them.
 * Functions align vertically using the longest name + that small gap
 * (not full-page space-between).
 */
export const MESSAGE_SIGNATURE_LAYOUT = {
  /** Gap between last message line and first signature (mm) */
  gapAfterMessageMm: 8,
  /** Vertical distance between signature baselines (mm) */
  rowHeightMm: 5,
  /** Literal gap between name and function (~3 normal spaces) */
  nameFunctionGap: "   ",
} as const;

export function contentWidth(): number {
  return A4.width - A4.marginLeft - A4.marginRight;
}

export function contentBottom(): number {
  return A4.height - A4.marginBottom;
}
