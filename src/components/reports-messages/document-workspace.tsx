import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DocumentWorkspaceProps = {
  form: ReactNode;
  preview: ReactNode;
  toolbar?: ReactNode;
  className?: string;
  /**
   * When true (Message / Demande editor): desktop form scrolls independently
   * while the A4 preview stays sticky/visible in the right column.
   * Other document types keep the default page-scroll layout.
   */
  stickyPreviewSplit?: boolean;
};

/**
 * Responsive Form | A4 Preview layout.
 * Desktop: side-by-side. Tablet/mobile: stacked.
 */
export function DocumentWorkspace({
  form,
  preview,
  toolbar,
  className,
  stickyPreviewSplit = false,
}: DocumentWorkspaceProps) {
  if (stickyPreviewSplit) {
    return (
      <div className={cn("flex min-h-0 flex-col gap-4", className)}>
        {toolbar ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbar}</div>
        ) : null}
        <div className="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,540px)] xl:items-start">
          <div className="min-w-0 space-y-4 xl:max-h-[calc(100dvh-9.5rem)] xl:overflow-y-auto xl:pr-1">
            {form}
          </div>
          <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <div className="max-h-[calc(100dvh-9.5rem)] overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
              {preview}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="min-w-0 space-y-4">{form}</div>
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="max-h-[calc(100vh-6rem)] overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}
