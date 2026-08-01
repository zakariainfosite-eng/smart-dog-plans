import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { AppLogo } from "@/components/brand/app-logo";

export function LoadingState({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
        <Loader2 className="relative h-7 w-7 animate-spin text-primary" />
      </div>
      <span className="text-sm font-medium">{label ?? t("common.loading")}</span>
    </div>
  );
}

export function FullscreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <AppLogo className="h-11 w-auto opacity-90 lg:h-14" />
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  );
}
