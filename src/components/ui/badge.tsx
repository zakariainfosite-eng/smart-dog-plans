import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-w-0 max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-border bg-muted text-muted-foreground",
        destructive: "border-destructive/15 bg-destructive/10 text-destructive",
        outline: "border-border bg-card text-foreground",
        success: "border-success/15 bg-success/10 text-[#15803d]",
        warning: "border-warning/15 bg-warning/10 text-[#b45309]",
        info: "border-primary/15 bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
