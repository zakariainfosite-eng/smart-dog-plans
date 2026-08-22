/**
 * Shared justified paragraph layout for Message / Demande body text.
 * Used by both A4 HTML preview and jsPDF export so wrapping/alignment match.
 */

export type JustifiedLine = {
  /** Words on this line (user text, unchanged) */
  words: string[];
  /**
   * When true, distribute extra space between words (full justify).
   * False for the last line of a paragraph and single-word lines.
   */
  justify: boolean;
  /** First line of the message — apply professional first-line indent */
  firstLineIndent?: boolean;
};

export type JustifiedParagraph = {
  /** Empty paragraph = blank line / paragraph break */
  lines: JustifiedLine[];
};

/** Typography for Message / Demande justified body (shared preview + PDF). */
export const MESSAGE_BODY_LAYOUT = {
  fontSizePt: 11,
  /** Baseline-to-baseline (mm) */
  lineHeightMm: 5,
  /** Extra space after a paragraph block (mm) */
  paragraphGapMm: 2.5,
  /** Top padding before first paragraph (mm) — slight breathing space after Destinataire / priority */
  topGapMm: 5.5,
  /** First-line indent ≈ 5 normal spaces (measured at render time) */
  firstLineIndentSpaces: "     ",
} as const;

/**
 * Split user text into paragraphs on newlines (preserve structure).
 * Empty lines become empty paragraphs (spacing only).
 */
export function splitMessageParagraphs(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Tokenize a paragraph into words without altering content.
 * Collapses only runs of spaces/tabs used as separators between words;
 * the words themselves are unchanged.
 */
export function tokenizeParagraph(paragraph: string): string[] {
  const trimmed = paragraph.replace(/^\s+|\s+$/g, "");
  if (!trimmed) return [];
  return trimmed.split(/[ \t]+/);
}

/**
 * Greedy word-wrap + mark which lines should be fully justified.
 * @param firstLineMaxWidth — narrower width for the first line when indenting
 */
export function layoutJustifiedParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
  options?: { firstLineMaxWidth?: number; markFirstLineIndent?: boolean },
): JustifiedLine[] {
  const words = tokenizeParagraph(paragraph);
  if (words.length === 0) return [];

  const spaceW = measure(" ");
  const lines: JustifiedLine[] = [];
  let current: string[] = [];
  let currentW = 0;
  let isFirstLine = true;

  const lineLimit = () =>
    isFirstLine && options?.firstLineMaxWidth != null
      ? options.firstLineMaxWidth
      : maxWidth;

  const pushLine = (lineWords: string[], justify: boolean) => {
    if (lineWords.length === 0) return;
    lines.push({
      words: lineWords,
      justify: justify && lineWords.length > 1,
      firstLineIndent: Boolean(options?.markFirstLineIndent && lines.length === 0),
    });
    isFirstLine = false;
  };

  for (const word of words) {
    const wordW = measure(word);
    if (current.length === 0) {
      current = [word];
      currentW = wordW;
      continue;
    }
    const nextW = currentW + spaceW + wordW;
    if (nextW <= lineLimit()) {
      current.push(word);
      currentW = nextW;
    } else {
      pushLine(current, true);
      current = [word];
      currentW = wordW;
    }
  }
  // Last line of paragraph: left-aligned (standard professional justify)
  pushLine(current, false);
  return lines;
}

/**
 * Full message → paragraphs of justified lines.
 * First line of the first non-empty paragraph gets a professional indent.
 */
export function layoutJustifiedMessage(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): JustifiedParagraph[] {
  const indentW = measure(MESSAGE_BODY_LAYOUT.firstLineIndentSpaces);
  const firstLineMax = Math.max(maxWidth - indentW, maxWidth * 0.5);
  let appliedFirstIndent = false;

  return splitMessageParagraphs(text).map((paragraph) => {
    const words = tokenizeParagraph(paragraph);
    if (words.length === 0) return { lines: [] };
    const useIndent = !appliedFirstIndent;
    if (useIndent) appliedFirstIndent = true;
    return {
      lines: layoutJustifiedParagraph(paragraph, maxWidth, measure, {
        firstLineMaxWidth: useIndent ? firstLineMax : undefined,
        markFirstLineIndent: useIndent,
      }),
    };
  });
}

/**
 * Compute X positions for words on a justified line.
 * Returns starting X for each word so the line spans [left, left+maxWidth].
 */
export function justifiedWordPositions(
  words: string[],
  left: number,
  maxWidth: number,
  justify: boolean,
  measure: (text: string) => number,
): number[] {
  if (words.length === 0) return [];
  if (!justify || words.length === 1) {
    const positions = [left];
    let x = left + measure(words[0]);
    const spaceW = measure(" ");
    for (let i = 1; i < words.length; i++) {
      x += spaceW;
      positions.push(x);
      x += measure(words[i]);
    }
    return positions;
  }

  const totalWordsW = words.reduce((sum, w) => sum + measure(w), 0);
  const gaps = words.length - 1;
  const gapW = (maxWidth - totalWordsW) / gaps;
  const positions: number[] = [];
  let x = left;
  for (let i = 0; i < words.length; i++) {
    positions.push(x);
    x += measure(words[i]);
    if (i < gaps) x += gapW;
  }
  return positions;
}
