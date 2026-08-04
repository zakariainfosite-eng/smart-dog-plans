import { useI18n } from "@/hooks/use-i18n";
import { StatusBadge as EnterpriseStatusBadge } from "@/components/enterprise/status-badge";
import {
  dogOperationalStatusLabelKey,
  dogOperationalStatusTone,
  type DogOperationalStatus,
} from "@/lib/dog-operational-status";

export function DogStatusBadge({ status }: { status: DogOperationalStatus }) {
  const { t } = useI18n();
  return (
    <EnterpriseStatusBadge
      tone={dogOperationalStatusTone(status)}
      className="px-2 py-0.5 text-[11px]"
    >
      {t(dogOperationalStatusLabelKey(status))}
    </EnterpriseStatusBadge>
  );
}
