import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DataTableShellProps = {
  children: ReactNode;
  isLoading?: boolean;
  loadingRows?: number;
  className?: string;
  /** @deprecated All tables now use unified page shell styling */
  variant?: "default" | "readable";
};

export function DataTableShell({
  children,
  isLoading,
  loadingRows = 5,
  className,
}: DataTableShellProps) {
  if (isLoading) {
    return (
      <div className={cn("space-y-2 p-6", className)}>
        {Array.from({ length: loadingRows }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return <div className={cn(className)}>{children}</div>;
}
