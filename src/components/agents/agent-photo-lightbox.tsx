import { useCallback, useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

type AgentPhotoLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string;
  alt: string;
};

export function AgentPhotoLightbox({
  open,
  onOpenChange,
  photoUrl,
  alt,
}: AgentPhotoLightboxProps) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);

  const resetZoom = useCallback(() => setZoom(1), []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetZoom();
      onOpenChange(next);
    },
    [onOpenChange, resetZoom],
  );

  const zoomIn = useCallback(() => {
    setZoom((current) => Math.min(MAX_ZOOM, Number((current + ZOOM_STEP).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((current) => Math.max(MIN_ZOOM, Number((current - ZOOM_STEP).toFixed(2))));
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, zoomIn, zoomOut]);

  useEffect(() => {
    if (!open) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))));
      });
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[60] bg-black/90",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "duration-200",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-[60] flex flex-col border-0 bg-transparent p-0 shadow-none outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-200",
          )}
          onClick={() => handleOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("agentDetails.photo.lightboxTitle", { name: alt })}
          </DialogPrimitive.Title>

          <DialogPrimitive.Close
            className={cn(
              "absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full",
              "bg-black/50 text-white backdrop-blur-sm transition-colors",
              "hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{t("agentDetails.photo.close")}</span>
          </DialogPrimitive.Close>

          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-16 sm:px-8">
            <img
              src={photoUrl}
              alt={alt}
              draggable={false}
              className={cn(
                "max-h-[min(85vh,100%)] max-w-[min(92vw,100%)] select-none object-contain",
                "transition-transform duration-200 ease-out",
              )}
              style={{ transform: `scale(${zoom})` }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>

          <div
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label={t("agentDetails.photo.zoomOut")}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs font-medium tabular-nums text-white/90">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-white hover:bg-white/15 hover:text-white"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label={t("agentDetails.photo.zoomIn")}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
