import * as React from "react";
import { SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const filterSelectClass =
  "h-9 w-full min-w-[7.5rem] rounded-full border-border bg-card px-4 text-sm shadow-soft transition-all duration-150 hover:border-primary/20 sm:w-auto";

export const FilterSelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectTrigger>,
  React.ComponentPropsWithoutRef<typeof SelectTrigger>
>(({ className, ...props }, ref) => (
  <SelectTrigger ref={ref} className={cn(filterSelectClass, className)} {...props} />
));
FilterSelectTrigger.displayName = "FilterSelectTrigger";
