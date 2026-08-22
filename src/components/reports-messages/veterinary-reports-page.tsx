import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import {
  ReportTemplateCard,
  roleCategoryHubLabelKey,
} from "@/components/reports-messages/report-cards";
import { buildDefaultPayload, createRoleDocument } from "@/lib/reports-messages/documents-store";
import { getTemplatesForRole } from "@/lib/reports-messages/templates";
import {
  DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
  canEditDocumentTemplates,
  fetchDocumentTemplatesSettingsOrDefault,
} from "@/lib/reports-messages/document-templates/template-overrides-store";
import { resolveEffectiveTemplate } from "@/lib/reports-messages/document-templates/merge-template";

export function VeterinaryReportsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const canManageTemplates = canEditDocumentTemplates(role);

  const { data: templateSettings } = useQuery({
    queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
    queryFn: () => fetchDocumentTemplatesSettingsOrDefault(db),
  });

  const templates = useMemo(() => {
    const all = getTemplatesForRole("veterinary");
    const settings = templateSettings ?? { byId: {} };
    return all.filter((template) => {
      const effective = resolveEffectiveTemplate(template.id, settings);
      if (!effective) return true;
      return effective.active;
    });
  }, [templateSettings]);

  const createMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates.find((item) => item.id === templateId);
      if (!template) throw new Error("Template not found");
      const payload = buildDefaultPayload(templateId, {
        userName: user?.email?.split("@")[0] ?? "Utilisateur",
        userEmail: user?.email,
      });
      return createRoleDocument(db, {
        roleCategory: "veterinary",
        templateId,
        title: t(template.titleKey),
        payload,
        createdByUserId: user?.id,
        createdByEmail: user?.email,
        createdByName: user?.email?.split("@")[0] ?? "Utilisateur",
        reportMonth: payload.report_month ? Number(payload.report_month) : null,
        reportYear: payload.report_year ? Number(payload.report_year) : null,
      });
    },
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: ["role-documents", "veterinary"] });
      void navigate({
        to: "/reports-messages/$roleCategory/$documentId",
        params: { roleCategory: "veterinary", documentId: document.id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageTitle
        icon={Stethoscope}
        title={t(roleCategoryHubLabelKey("veterinary"))}
        description={t("reportsMessages.veterinary.workspaceDescription")}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.reportsMessages") },
          { label: t("reportsMessages.veterinary.shortLabel") },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageTemplates ? (
              <Button variant="secondary" asChild>
                <Link to="/reports-messages/templates">
                  <FileStack className="mr-1.5 h-4 w-4" />
                  {t("reportsMessages.templateManagement.title")}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void navigate({ to: "/reports-messages" })}>
              {t("reportsMessages.backToHub")}
            </Button>
          </div>
        }
      />

      <PageContentShell className="space-y-6 p-6 sm:p-8">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("reportsMessages.veterinary.documentTypes")}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <ReportTemplateCard
                key={template.id}
                icon={template.icon}
                title={t(template.titleKey)}
                description={t(template.descriptionKey)}
                createLabel={t("reportsMessages.actions.create")}
                busy={createMutation.isPending}
                onCreate={() => createMutation.mutate(template.id)}
              />
            ))}
          </div>
        </section>
      </PageContentShell>
    </div>
  );
}
