import { useEffect, useState } from "react";
import { loadMessageDemandeOfficialLogo } from "@/lib/reports-messages/official-document/message-demande-logo";
import { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
} from "@/lib/reports-messages/official-document/types";
import { cn } from "@/lib/utils";

type Props = {
  model: OfficialDocumentModel;
  labels: OfficialDocumentBuildContext["labels"];
  /** Accessible name for the embedded viewer */
  title?: string;
  className?: string;
  /** Debounce regeneration while the user types (ms) */
  debounceMs?: number;
};

/**
 * True PDF preview: same `renderOfficialDocumentPdf` as export → blob → iframe.
 * No separate HTML/CSS document layout — one renderer, one document.
 */
export function OfficialPdfPreview({
  model,
  labels,
  title = "Aperçu PDF A4",
  className,
  debounceMs = 120,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoData, setLogoData] = useState<string | Uint8Array | undefined>();
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadMessageDemandeOfficialLogo().then((bytes) => {
      if (!active) return;
      setLogoData(bytes);
      setLogoReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!logoReady) return;
    let active = true;
    let createdUrl: string | null = null;

    const timer = window.setTimeout(() => {
      try {
        const doc = renderOfficialDocumentPdf(model, labels, { logoData });
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
        if (active) {
          setError("Impossible de générer l'aperçu PDF.");
        }
      }
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [model, labels, debounceMs, logoData, logoReady]);

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
      {error ? (
        <p className="p-4 text-sm text-destructive">{error}</p>
      ) : null}
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
