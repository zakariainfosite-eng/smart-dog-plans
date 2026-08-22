import { useLayoutEffect, useMemo, useState } from "react";
import {
  MESSAGE_BODY_LAYOUT,
  layoutJustifiedMessage,
  type JustifiedParagraph,
} from "@/lib/reports-messages/official-document/justified-text";
import { contentWidth } from "@/lib/reports-messages/official-document/layout";

type Props = {
  text: string;
};

/**
 * Browser measurer approximating jsPDF Times at 11pt in millimetres.
 * Used so preview line breaks stay close to the exported PDF.
 */
function createTimesMeasurerMm(fontSizePt: number): (text: string) => number {
  if (typeof document === "undefined") {
    // SSR / non-DOM fallback: rough Times average advance
    const em = fontSizePt * 0.352778; // pt → mm
    return (text: string) => text.length * em * 0.45;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const em = fontSizePt * 0.352778;
    return (text: string) => text.length * em * 0.45;
  }
  // 1pt = 96/72 CSS px
  const px = fontSizePt * (96 / 72);
  ctx.font = `${px}px "Times New Roman", Times, serif`;
  const pxToMm = 25.4 / 96;
  return (text: string) => ctx.measureText(text).width * pxToMm;
}

/**
 * Message / Demande body — justified paragraphs matching PDF layout constants.
 */
export function JustifiedMessageBody({ text }: Props) {
  const maxW = contentWidth();
  const { fontSizePt, lineHeightMm, paragraphGapMm, topGapMm, firstLineIndentSpaces } =
    MESSAGE_BODY_LAYOUT;

  const [paragraphs, setParagraphs] = useState<JustifiedParagraph[]>(() =>
    layoutJustifiedMessage(text, maxW, createTimesMeasurerMm(fontSizePt)),
  );

  useLayoutEffect(() => {
    const measure = createTimesMeasurerMm(fontSizePt);
    setParagraphs(layoutJustifiedMessage(text, maxW, measure));
  }, [text, maxW, fontSizePt]);

  const blocks = useMemo(() => paragraphs, [paragraphs]);
  const indentCh = firstLineIndentSpaces.length;

  if (!text.trim()) return null;

  return (
    <div
      className="w-full font-[Times_New_Roman,Times,serif] text-black"
      style={{
        marginTop: `${topGapMm}mm`,
        fontSize: `${fontSizePt}pt`,
        width: `${maxW}mm`,
        maxWidth: `${maxW}mm`,
      }}
    >
      {blocks.map((paragraph, pIndex) => {
        if (paragraph.lines.length === 0) {
          return (
            <div
              key={`empty-${pIndex}`}
              style={{ height: `${paragraphGapMm}mm` }}
              aria-hidden
            />
          );
        }
        return (
          <div
            key={`p-${pIndex}`}
            style={{
              marginBottom: `${paragraphGapMm}mm`,
            }}
          >
            {paragraph.lines.map((line, lIndex) => {
              const indentStyle = line.firstLineIndent
                ? { paddingLeft: `${indentCh}ch` }
                : undefined;
              if (line.justify) {
                return (
                  <div
                    key={`l-${pIndex}-${lIndex}`}
                    className="flex w-full box-border"
                    style={{
                      height: `${lineHeightMm}mm`,
                      justifyContent: "space-between",
                      ...indentStyle,
                    }}
                  >
                    {line.words.map((word, wIndex) => (
                      <span
                        key={`w-${pIndex}-${lIndex}-${wIndex}`}
                        className="shrink-0 whitespace-nowrap"
                        style={{ lineHeight: `${lineHeightMm}mm` }}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                );
              }
              return (
                <p
                  key={`l-${pIndex}-${lIndex}`}
                  className="m-0 w-full box-border whitespace-nowrap"
                  style={{
                    height: `${lineHeightMm}mm`,
                    lineHeight: `${lineHeightMm}mm`,
                    textAlign: "left",
                    ...indentStyle,
                  }}
                >
                  {line.words.join(" ")}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
