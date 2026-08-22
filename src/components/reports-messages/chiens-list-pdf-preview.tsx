import { useEffect, useMemo, useState } from "react";
import { generateDogsListPdf } from "@/lib/documents/feuille-presence-pdf";
import { buildSampleChienListPdfData } from "@/lib/documents/build-dogs-list-pdf-data";
import type {
  ChienPdfMinAgeYears,
  ChienPdfSexFilter,
  ChienPdfTableFieldConfig,
} from "@/lib/reports-messages/chien-pdf-table-fields";
import { cn } from "@/lib/utils";

type Props = {
  fields: ChienPdfTableFieldConfig[];
  sexFilter?: ChienPdfSexFilter;
  minAgeYears?: ChienPdfMinAgeYears;
  title?: string;
  className?: string;
  debounceMs?: number;
};

/**
 * Same generator as Page Chiens → Exporter PDF.
 */
export function ChiensListPdfPreview({
  fields,
  sexFilter,
  minAgeYears,
  title = "Aperçu PDF A4",
  className,
  debounceMs = 120,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useMemo(
    () => buildSampleChienListPdfData(fields, sexFilter, minAgeYears),
    [fields, sexFilter, minAgeYears],
  );

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const timer = window.setTimeout(() => {
      try {
        const doc = generateDogsListPdf({ data, year: new Date().getFullYear() });
        const blob = doc.output("blob") as Blob;
        createdUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setError(null);
        setUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return createdUrl;
        });
      } catch (err) {
        console.error(err);
        if (active) setError("Impossible de générer l'aperçu PDF.");
      }
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [data, debounceMs]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md bg-neutral-100",
        className,
      )}
    >
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {url ? (
        <iframe
          title={title}
          src={`${url}#view=FitH&toolbar=0`}
          className="h-[min(820px,calc(100dvh-10rem))] w-full min-h-[520px] border-0 bg-white"
        />
      ) : (
        <div className="flex h-[min(820px,calc(100dvh-10rem))] min-h-[520px] items-center justify-center text-sm text-muted-foreground">
          Génération de l'aperçu…
        </div>
      )}
    </div>
  );
}
