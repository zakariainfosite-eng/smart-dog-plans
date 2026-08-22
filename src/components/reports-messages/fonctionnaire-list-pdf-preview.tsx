import { useEffect, useMemo, useState } from "react";
import { generateCynotechniciansListPdf } from "@/lib/documents/feuille-presence-pdf";
import { buildSampleFonctionnaireListPdfData } from "@/lib/documents/build-cynotechnicians-list-pdf-data";
import type {
  FonctionnairePdfListScope,
  FonctionnairePdfTableFieldConfig,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import { cn } from "@/lib/utils";

type Props = {
  fields: FonctionnairePdfTableFieldConfig[];
  listScope?: FonctionnairePdfListScope;
  title?: string;
  className?: string;
  debounceMs?: number;
};

/**
 * Same generator as Page Fonctionnaires → Exporter la liste PDF.
 */
export function FonctionnaireListPdfPreview({
  fields,
  listScope,
  title = "Aperçu PDF A4",
  className,
  debounceMs = 120,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useMemo(
    () => buildSampleFonctionnaireListPdfData(fields, listScope),
    [fields, listScope],
  );

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const timer = window.setTimeout(() => {
      try {
        const doc = generateCynotechniciansListPdf({ data, year: new Date().getFullYear() });
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
