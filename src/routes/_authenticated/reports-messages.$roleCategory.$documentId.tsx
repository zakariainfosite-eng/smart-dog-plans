import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { getAgents, getDogs, getSections } from "@/integrations/database";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ReportForm } from "@/components/reports-messages/report-form";
import { DocumentActions, ReportPreview } from "@/components/reports-messages/document-actions";
import {
  deleteRoleDocument,
  duplicateRoleDocument,
  fetchRoleDocumentById,
  finalizeRoleDocument,
  updateRoleDocument,
} from "@/lib/reports-messages/documents-store";
import { downloadRoleDocumentPdf, printRoleDocumentPdf } from "@/lib/reports-messages/pdf-export";
import { getReportTemplate } from "@/lib/reports-messages/templates";
import type { RoleCategory, RoleDocumentPayload } from "@/lib/reports-messages/types";
import { roleCategoryLabelKey } from "@/components/reports-messages/report-cards";
import { roleCategoryPath } from "@/lib/reports-messages/permissions";

export const Route = createFileRoute("/_authenticated/reports-messages/$roleCategory/$documentId")({
  head: () => ({ meta: [{ title: "Document — CynoPlanning" }] }),
  component: ReportDocumentPage,
});

function ReportDocumentPage() {
  const { roleCategory, documentId } = Route.useParams();
  const category = roleCategory as RoleCategory;
  const { t } = useI18n();
  useDocumentTitle("meta.reportsMessages.document");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [payload, setPayload] = useState<RoleDocumentPayload>({});
  const [editing, setEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: document, isLoading } = useQuery({
    queryKey: ["role-document", documentId],
    queryFn: () => fetchRoleDocumentById(db, documentId),
  });

  const { data: agents = [] } = useQuery({ queryKey: ["agents-full"], queryFn: getAgents });
  const { data: dogs = [] } = useQuery({ queryKey: ["dogs"], queryFn: getDogs });
  const { data: sections = [] } = useQuery({ queryKey: ["sections"], queryFn: getSections });

  const template = useMemo(
    () => (document ? getReportTemplate(document.template_id) : undefined),
    [document],
  );

  useEffect(() => {
    if (!document) return;
    setTitle(document.title);
    setPayload(document.payload);
    setEditing(document.status === "draft");
  }, [document]);

  const agentLabel = useMemo(() => {
    const id = document?.agent_id ?? payload.agent_id;
    if (!id) return null;
    const agent = agents.find((row) => row.id === id);
    return agent ? `${agent.first_name} ${agent.last_name}` : null;
  }, [agents, document, payload.agent_id]);

  const dogLabel = useMemo(() => {
    const id = document?.dog_id ?? payload.dog_id;
    if (!id) return null;
    return dogs.find((row) => row.id === id)?.name ?? null;
  }, [dogs, document, payload.dog_id]);

  const sectionLabel = useMemo(() => {
    const id = document?.section_id ?? payload.section_id;
    if (!id) return null;
    return sections.find((row) => row.id === id)?.name ?? null;
  }, [sections, document, payload.section_id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("Document not found");
      return updateRoleDocument(db, document.id, {
        title,
        payload,
        agentId: payload.agent_id || null,
        dogId: payload.dog_id || null,
        sectionId: payload.section_id || null,
        reportMonth: payload.report_month ? Number(payload.report_month) : null,
        reportYear: payload.report_year ? Number(payload.report_year) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["role-documents", category] });
      toast.success(t("reportsMessages.toast.saved"));
      setEditing(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("Document not found");
      if (document.status === "draft") {
        await updateRoleDocument(db, document.id, {
          title,
          payload,
          agentId: payload.agent_id || null,
          dogId: payload.dog_id || null,
          sectionId: payload.section_id || null,
          reportMonth: payload.report_month ? Number(payload.report_month) : null,
          reportYear: payload.report_year ? Number(payload.report_year) : null,
        });
      }
      return finalizeRoleDocument(db, document.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["role-documents", category] });
      toast.success(t("reportsMessages.toast.finalized"));
      setEditing(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("Document not found");
      return duplicateRoleDocument(db, document.id, {
        userId: user?.id,
        email: user?.email,
        name: user?.email?.split("@")[0],
      });
    },
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["role-documents", category] });
      toast.success(t("reportsMessages.toast.duplicated"));
      void navigate({
        to: "/reports-messages/$roleCategory/$documentId",
        params: { roleCategory: category, documentId: copy.id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!document) return;
      await deleteRoleDocument(db, document.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-documents", category] });
      toast.success(t("reportsMessages.toast.deleted"));
      void navigate({ to: roleCategoryPath(category) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportPdf = async () => {
    if (!document || !template) return;
    await downloadRoleDocumentPdf({
      document: { ...document, title, payload },
      template,
      t,
      agentLabel,
      dogLabel,
      sectionLabel,
    });
  };

  const printPdf = async () => {
    if (!document || !template) return;
    await printRoleDocumentPdf({
      document: { ...document, title, payload },
      template,
      t,
      agentLabel,
      dogLabel,
      sectionLabel,
    });
  };

  if (isLoading || !document || !template) {
    return (
      <PageContentShell>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageContentShell>
    );
  }

  const readOnly = document.status === "finalized" && !editing;
  const currentDocument = { ...document, title, payload };

  return (
    <div className="space-y-6">
      <PageTitle
        title={title}
        description={t(template.titleKey)}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.reportsMessages") },
          { label: t(roleCategoryLabelKey(category)) },
          { label: title },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => void navigate({ to: roleCategoryPath(category) })}
          >
            {t("reportsMessages.backToRole")}
          </Button>
        }
      />

      <PageContentShell className="space-y-6">
        <DocumentActions
          document={currentDocument}
          canEdit={document.status === "draft"}
          busy={
            saveMutation.isPending ||
            finalizeMutation.isPending ||
            duplicateMutation.isPending ||
            deleteMutation.isPending
          }
          onPreview={() => setShowPreview((value) => !value)}
          onEdit={() => setEditing(true)}
          onExportPdf={() => void exportPdf()}
          onPrint={() => void printPdf()}
          onDuplicate={() => duplicateMutation.mutate()}
          onFinalize={() => finalizeMutation.mutate()}
          onDelete={() => deleteMutation.mutate()}
          t={t}
        />

        {showPreview ? (
          <ReportPreview
            document={currentDocument}
            template={template}
            agentLabel={agentLabel}
            dogLabel={dogLabel}
            sectionLabel={sectionLabel}
            t={t}
          />
        ) : null}

        <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
          <div>
            <Label htmlFor="document-title">{t("reportsMessages.form.documentTitle")}</Label>
            <Input
              id="document-title"
              value={title}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5"
            />
          </div>

          <ReportForm
            fields={template.fields}
            payload={payload}
            onChange={setPayload}
            agents={agents}
            dogs={dogs}
            sections={sections}
            t={t}
            disabled={readOnly}
          />

          {document.status === "draft" ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTitle(document.title);
                  setPayload(document.payload);
                  setEditing(false);
                }}
              >
                {t("action.cancel")}
              </Button>
              <Button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {t("reportsMessages.actions.saveDraft")}
              </Button>
            </div>
          ) : null}
        </div>
      </PageContentShell>
    </div>
  );
}
