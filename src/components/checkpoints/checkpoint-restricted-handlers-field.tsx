import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, UserX, X } from "lucide-react";
import type { TFunction } from "i18next";

import { getAgents } from "@/integrations/database";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isCynotechnicienFonction } from "@/lib/personnel-fonction";
import { cn } from "@/lib/utils";

type HandlerOption = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
};

function handlerLabel(handler: HandlerOption): string {
  const name = `${handler.first_name} ${handler.last_name}`.trim();
  return handler.professional_number ? `${name} (${handler.professional_number})` : name;
}

export function CheckpointRestrictedHandlersField({
  selectedIds,
  onChange,
  t,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  t: TFunction;
}) {
  const [open, setOpen] = useState(false);
  const { data: handlers = [] } = useQuery({
    queryKey: ["active-cynotechnicians-for-checkpoint-restrictions"],
    queryFn: async (): Promise<HandlerOption[]> => {
      const rows = await getAgents();
      return rows
        .filter((row) => row.active && isCynotechnicienFonction(row.fonction))
        .map((row) => ({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          professional_number: row.professional_number,
        }))
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, undefined, {
            sensitivity: "base",
          }),
        );
    },
  });

  const selected = useMemo(() => {
    const byId = new Map(handlers.map((handler) => [handler.id, handler]));
    return selectedIds
      .map((id) => byId.get(id) ?? { id, first_name: id, last_name: "", professional_number: "" })
      .sort((a, b) => handlerLabel(a).localeCompare(handlerLabel(b), undefined, { sensitivity: "base" }));
  }, [handlers, selectedIds]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id],
    );
  };

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between font-normal"
          >
            <span className="flex min-w-0 items-center gap-2 truncate">
              <UserX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">
                {selected.length > 0
                  ? t("checkpoints.config.restrictedHandlersSelected", { count: selected.length })
                  : t("checkpoints.config.restrictedHandlersSearch")}
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("checkpoints.config.restrictedHandlersSearch")} />
            <CommandList>
              <CommandEmpty>{t("checkpoints.config.restrictedHandlersEmpty")}</CommandEmpty>
              <CommandGroup>
                {handlers.map((handler) => {
                  const selectedHandler = selectedIds.includes(handler.id);
                  return (
                    <CommandItem
                      key={handler.id}
                      value={`${handler.first_name} ${handler.last_name} ${handler.professional_number}`}
                      onSelect={() => toggle(handler.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          selectedHandler ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{handlerLabel(handler)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("checkpoints.config.restrictedHandlersNone")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((handler) => (
            <li key={handler.id}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <span className="truncate">{handlerLabel(handler)}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-destructive/15"
                  onClick={() => toggle(handler.id)}
                  aria-label={t("checkpoints.config.restrictedHandlersRemove")}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
