import { useI18n } from "@/hooks/use-i18n";
import { StatusBadge as EnterpriseStatusBadge } from "@/components/enterprise/status-badge";
import type { Database } from "@/integrations/database/schema-types";

type DogStatus = Database["public"]["Enums"]["dog_status"];

const tone: Record<DogStatus, "success" | "danger" | "warning"> = {
  available: "success",
  sick: "danger",
  heat: "warning",
};

export function DogStatusBadge({ status }: { status: DogStatus }) {
  const { t } = useI18n();
  return (
    <EnterpriseStatusBadge tone={tone[status]} className="px-2 py-0.5 text-[11px]">
      {t(`dogStatus.${status}`)}
    </EnterpriseStatusBadge>
  );
}
