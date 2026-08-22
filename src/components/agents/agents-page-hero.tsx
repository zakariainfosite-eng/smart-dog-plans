import type { ReactNode } from "react";
import { Shield, Download, FileText, Plus, Settings2 } from "lucide-react";

import {
  PageHero,
  PageFilterToolbar,
  PageTableShell,
  type PageHeroBreadcrumbItem,
} from "@/components/enterprise/page-layout";

type AgentsPageHeroProps = {
  title: string;
  subtitle: string;
  breadcrumb?: PageHeroBreadcrumbItem[];
  addLabel: string;
  exportLabel: string;
  exportPdfLabel?: string;
  onAdd: () => void;
  onExport: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
  exportPdfDisabled?: boolean;
  loading?: boolean;
  managePdfLabel?: string;
  onManagePdf?: () => void;
};

export function AgentsPageHero({
  title,
  subtitle,
  breadcrumb,
  addLabel,
  exportLabel,
  exportPdfLabel,
  onAdd,
  onExport,
  onExportPdf,
  exportDisabled,
  exportPdfDisabled,
  loading,
  managePdfLabel,
  onManagePdf,
}: AgentsPageHeroProps) {
  return (
    <PageHero
      icon={Shield}
      title={title}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      loading={loading}
      actions={[
        { label: addLabel, onClick: onAdd, icon: Plus, variant: "primary" },
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
        ...(managePdfLabel && onManagePdf
          ? [
              {
                label: managePdfLabel,
                onClick: onManagePdf,
                icon: Settings2,
                variant: "secondary" as const,
              },
            ]
          : []),
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
