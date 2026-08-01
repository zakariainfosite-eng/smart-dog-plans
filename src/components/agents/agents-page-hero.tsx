import type { ReactNode } from "react";
import { Shield, Download, FileText, Plus } from "lucide-react";

import {
  PageHero,
  PageFilterToolbar,
  PageTableShell,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";

type AgentsPageHeroProps = {
  title: string;
  subtitle: string;
  totalAgents: number;
  activeToday: number;
  lastUpdated: string;
  totalLabel: string;
  activeTodayLabel: string;
  lastUpdatedLabel: string;
  addLabel: string;
  exportLabel: string;
  exportPdfLabel?: string;
  onAdd: () => void;
  onExport: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  exportPdfDisabled?: boolean;
  loading?: boolean;
};

export function AgentsPageHero({
  title,
  subtitle,
  totalAgents,
  activeToday,
  lastUpdated,
  totalLabel,
  activeTodayLabel,
  lastUpdatedLabel,
  addLabel,
  exportLabel,
  exportPdfLabel,
  onAdd,
  onExport,
  onExportPdf,
  exportDisabled,
  exportPdfDisabled,
  loading,
}: AgentsPageHeroProps) {
  return (
    <PageHero
      icon={Shield}
      title={title}
      subtitle={subtitle}
      loading={loading}
      meta={[
        { label: totalLabel, value: totalAgents },
        pageHeroLastUpdatedMeta(lastUpdatedLabel, lastUpdated),
        {
          label: activeTodayLabel,
          value: activeToday,
          dotClassName: "bg-emerald-500",
          valueClassName: "text-emerald-700 dark:text-emerald-400",
        },
      ]}
      actions={[
        {
          label: exportLabel,
          onClick: onExport,
          icon: Download,
          variant: "secondary",
          disabled: exportDisabled,
        },
        ...(exportPdfLabel && onExportPdf
          ? [
              {
                label: exportPdfLabel,
                onClick: onExportPdf,
                icon: FileText,
                variant: "secondary" as const,
                disabled: exportPdfDisabled ?? exportDisabled,
              },
            ]
          : []),
        { label: addLabel, onClick: onAdd, icon: Plus, variant: "primary" },
      ]}
    />
  );
}

export { PageFilterToolbar as AgentsFilterToolbar, PageTableShell as AgentsTableShell };

export type AgentsFilterToolbarProps = {
  children: ReactNode;
  resetLabel: string;
  onReset: () => void;
  showReset: boolean;
  className?: string;
};
