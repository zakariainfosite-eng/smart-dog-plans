import type { OfficialPriority } from "@/lib/reports-messages/official-document/types";

type Props = {
  priority: OfficialPriority;
};

/** Official priority mark — URGENT only (NORMAL is omitted). */
export function OfficialPriorityMark({ priority }: Props) {
  if (priority !== "URGENT") return null;
  return (
    <p className="mt-4 text-center text-[15px] font-bold tracking-[0.35em]">
      U R G E N T
    </p>
  );
}
