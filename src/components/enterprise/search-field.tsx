import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchField({ value, onChange, placeholder, className }: SearchFieldProps) {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[var(--radius)] border-border bg-card pl-11 shadow-search transition-shadow duration-150 focus-visible:shadow-card"
      />
    </div>
  );
}
