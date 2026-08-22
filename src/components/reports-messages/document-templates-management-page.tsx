import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileStack, Pencil } from "lucide-react";
import { db } from "@/integrations/database/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_TEMPLATES } from "@/lib/reports-messages/document-templates/registry";
import {
  buildDefaultOverrideFromConfig,
  getManagedTemplateIds,
  resolveEffectiveTemplate,
} from "@/lib/reports-messages/document-templates/merge-template";
import {
  DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
  canEditDocumentTemplates,
  fetchDocumentTemplatesSettingsOrDefault,
} from "@/lib/reports-messages/document-templates/template-overrides-store";

export function DocumentTemplatesManagementPage() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditDocumentTemplates(role);

  const { data: settings } = useQuery({
    queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
    queryFn: () => fetchDocumentTemplatesSettingsOrDefault(db),
  });

  const rows = useMemo(() => {
    const managed = new Set(getManagedTemplateIds());
    return DOCUMENT_TEMPLATES.filter((item) => managed.has(item.id)).map((item) => {
      const effective = resolveEffectiveTemplate(item.id, settings ?? { byId: {} });
      const defaults = buildDefaultOverrideFromConfig(item);
      const override = settings?.byId[item.id];
      return {
        id: item.id,
        icon: item.icon,
        title: t(item.titleKey),
        kind: item.kind,
        active: effective?.active ?? item.active,
        sectionCount: (effective?.sectionMeta ?? defaults.sections).filter((s) => s.visible)
          .length,
        updatedAt: override?.updatedAt ?? null,
      };
    });
  }, [settings, t]);

  return (
    <div className="space-y-6">
      <PageTitle
        icon={FileStack}
        title={t("reportsMessages.templateManagement.title")}
        description={t("reportsMessages.templateManagement.description")}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.reportsMessages") },
          { label: t("reportsMessages.templateManagement.title") },
        ]}
        actions={
          <Button variant="outline" asChild>
            <Link to="/reports-messages">{t("reportsMessages.backToHub")}</Link>
          </Button>
        }
      />

      <PageContentShell className="space-y-4 p-4 sm:p-6">
        {!canEdit ? (
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {t("reportsMessages.templateManagement.viewOnly")}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">
                  {t("reportsMessages.templateManagement.columns.name")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("reportsMessages.templateManagement.columns.type")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("reportsMessages.templateManagement.columns.status")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("reportsMessages.templateManagement.columns.sections")}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t("reportsMessages.templateManagement.columns.updated")}
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  {t("reportsMessages.templateManagement.columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span aria-hidden>{row.icon}</span>
                      {row.title}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t(`reportsMessages.kinds.${row.kind}`)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.active ? "default" : "secondary"}>
                      {row.active
                        ? t("reportsMessages.templateManagement.status.active")
                        : t("reportsMessages.templateManagement.status.inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.sectionCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.updatedAt
                      ? new Date(row.updatedAt).toLocaleString()
                      : t("reportsMessages.templateManagement.neverModified")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to="/reports-messages/templates/$templateId"
                        params={{ templateId: row.id }}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        {t("reportsMessages.templateManagement.actions.edit")}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageContentShell>
    </div>
  );
}
