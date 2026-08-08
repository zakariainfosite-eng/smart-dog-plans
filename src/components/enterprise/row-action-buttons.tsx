import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type RowActionButtonsProps = {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
  /** Accessible label for the ⋮ trigger when `mode="menu"`. */
  menuLabel?: string;
  /**
   * `icons` — pencil + trash (default).
   * `menu` — compact ⋮ menu (Notion / Linear style).
   */
  mode?: "icons" | "menu";
};

const actionHitArea =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent shadow-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023A84]/25 focus-visible:ring-offset-1";

/**
 * Compact card/row actions — icon-only, transparent, no borders/shadows.
 */
export function RowActionButtons({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
  className,
  menuLabel,
  mode = "icons",
}: RowActionButtonsProps) {
  if (mode === "menu") {
    return (
      <div className={cn("flex items-center justify-end", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                actionHitArea,
                "text-[#6B7280] hover:bg-[#F1F5F9] hover:text-[#023A84]",
              )}
              aria-label={menuLabel ?? editLabel}
            >
              <MoreVertical className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-xl">
            <DropdownMenuItem
              className="gap-2 rounded-lg"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-4 w-4 text-[#023A84]" />
              {editLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 rounded-lg text-[#DC2626] focus:bg-[#FEE2E2] focus:text-[#DC2626]"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              {deleteLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <button
        type="button"
        className={cn(
          actionHitArea,
          "text-[#6B7280] hover:bg-[#EAF3FF] hover:text-[#023A84]",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label={editLabel}
      >
        <Pencil className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
      <button
        type="button"
        className={cn(
          actionHitArea,
          "text-[#6B7280] hover:bg-[#FEE2E2] hover:text-[#DC2626]",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={deleteLabel}
      >
        <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </div>
  );
}
