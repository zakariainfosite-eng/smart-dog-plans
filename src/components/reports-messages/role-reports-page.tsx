import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ClipboardList, Dog, Stethoscope, Wrench } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { getAgents, getDogs } from "@/integrations/database";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ReportTemplateCard,
  RoleHubCard,
  roleCategoryDescriptionKey,
  roleCategoryHubDescriptionKey,
  roleCategoryHubLabelKey,
  roleCategoryLabelKey,
} from "@/components/reports-messages/report-cards";
import { ReportHistoryPanel } from "@/components/reports-messages/report-history-panel";
import {
  buildDefaultPayload,
  createRoleDocument,
  fetchRoleDocuments,
} from "@/lib/reports-messages/documents-store";
import { roleCategoryPath } from "@/lib/reports-messages/permissions";
import { getTemplatesForRole } from "@/lib/reports-messages/templates";
import type { DocumentStatus, RoleCategory } from "@/lib/reports-messages/types";

type RoleReportsPageProps = {
  roleCategory: RoleCategory;
};

export function RoleReportsPage({ roleCategory }: RoleReportsPageProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dogFilter, setDogFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");

  const templates = useMemo(() => getTemplatesForRole(roleCategory), [roleCategory]);

  const { data: agents = [] } = useQuery({ queryKey: ["agents-full"], queryFn: getAgents });
  const { data: dogs = [] } = useQuery({ queryKey: ["dogs"], queryFn: getDogs });

  const { data: documents = [] } = useQuery({
    queryKey: [
      "role-documents",
      roleCategory,
      search,
      yearFilter,
      monthFilter,
      templateFilter,
      agentFilter,
      dogFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchRoleDocuments(db, {
        roleCategory,
        search,
        templateId: templateFilter,
        year: yearFilter === "all" ? "all" : Number(yearFilter),
        month: monthFilter === "all" ? "all" : Number(monthFilter),
        agentId: agentFilter,
        dogId: dogFilter,
        status: statusFilter,
      }),
  });

  const createMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates.find((item) => item.id === templateId);
      if (!template) throw new Error("Template not found");
      const payload = buildDefaultPayload(templateId, {
        userName: user?.email?.split("@")[0] ?? "Utilisateur",
        userEmail: user?.email,
      });
      return createRoleDocument(db, {
        roleCategory,
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
      queryClient.invalidateQueries({ queryKey: ["role-documents", roleCategory] });
      void navigate({
        to: "/reports-messages/$roleCategory/$documentId",
        params: { roleCategory, documentId: document.id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredDocuments = documents;

  const drafts = filteredDocuments.filter((document) => document.status === "draft");
  const finalized = filteredDocuments.filter((document) => document.status === "finalized");
  const monthly = filteredDocuments.filter((document) => document.document_kind === "monthly");
  const messages = filteredDocuments.filter((document) => document.document_kind === "message");

  const templateTitle = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    return template ? t(template.titleKey) : templateId;
  };

  const openDocument = (documentId: string) => {
    void navigate({
      to: "/reports-messages/$roleCategory/$documentId",
      params: { roleCategory, documentId },
    });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        icon={FileText}
        title={t(roleCategoryLabelKey(roleCategory))}
        description={t(roleCategoryDescriptionKey(roleCategory))}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.reportsMessages") },
          { label: t(roleCategoryLabelKey(roleCategory)) },
        ]}
        actions={
          <Button variant="outline" onClick={() => void navigate({ to: "/reports-messages" })}>
            {t("reportsMessages.backToHub")}
          </Button>
        }
      />

      <PageContentShell>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("reportsMessages.sections.templates")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <ReportTemplateCard
                key={template.id}
                icon={template.icon}
                title={t(template.titleKey)}
                description={t(template.descriptionKey)}
                onClick={() => createMutation.mutate(template.id)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder={t("reportsMessages.filters.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("reportsMessages.filters.type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allTypes")}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {t(template.titleKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("reportsMessages.filters.year")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allYears")}</SelectItem>
                {Array.from({ length: 6 }, (_, index) =>
                  String(new Date().getFullYear() - index),
                ).map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("reportsMessages.filters.month")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allMonths")}</SelectItem>
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => (
                  <SelectItem key={month} value={month}>
                    {month.padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("reportsMessages.filters.agent")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allAgents")}</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dogFilter} onValueChange={setDogFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("reportsMessages.filters.dog")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allDogs")}</SelectItem>
                {dogs.map((dog) => (
                  <SelectItem key={dog.id} value={dog.id}>
                    {dog.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as DocumentStatus | "all")}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("reportsMessages.filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reportsMessages.filters.allStatuses")}</SelectItem>
                <SelectItem value="draft">{t("reportsMessages.status.draft")}</SelectItem>
                <SelectItem value="finalized">{t("reportsMessages.status.finalized")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="drafts">
            <TabsList>
              <TabsTrigger value="new">{t("reportsMessages.tabs.new")}</TabsTrigger>
              <TabsTrigger value="drafts">{t("reportsMessages.tabs.drafts")}</TabsTrigger>
              <TabsTrigger value="previous">{t("reportsMessages.tabs.previous")}</TabsTrigger>
              <TabsTrigger value="monthly">{t("reportsMessages.tabs.monthly")}</TabsTrigger>
              <TabsTrigger value="messages">{t("reportsMessages.tabs.messages")}</TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4">
              <p className="text-sm text-muted-foreground">{t("reportsMessages.tabs.newHint")}</p>
            </TabsContent>
            <TabsContent value="drafts" className="mt-4">
              <ReportHistoryPanel
                documents={drafts}
                emptyLabel={t("reportsMessages.empty.drafts")}
                onOpen={(document) => openDocument(document.id)}
                templateTitle={templateTitle}
                t={t}
              />
            </TabsContent>
            <TabsContent value="previous" className="mt-4">
              <ReportHistoryPanel
                documents={finalized}
                emptyLabel={t("reportsMessages.empty.previous")}
                onOpen={(document) => openDocument(document.id)}
                templateTitle={templateTitle}
                t={t}
              />
            </TabsContent>
            <TabsContent value="monthly" className="mt-4">
              <ReportHistoryPanel
                documents={monthly}
                emptyLabel={t("reportsMessages.empty.monthly")}
                onOpen={(document) => openDocument(document.id)}
                templateTitle={templateTitle}
                t={t}
              />
            </TabsContent>
            <TabsContent value="messages" className="mt-4">
              <ReportHistoryPanel
                documents={messages}
                emptyLabel={t("reportsMessages.empty.messages")}
                onOpen={(document) => openDocument(document.id)}
                templateTitle={templateTitle}
                t={t}
              />
            </TabsContent>
          </Tabs>
        </section>
      </PageContentShell>
    </div>
  );
}

export function ReportsMessagesHubPage() {
  const { t } = useI18n();
  const categories: RoleCategory[] = ["veterinary", "assistant", "secretary", "equipment_chief"];

  const categoryIcons: Record<RoleCategory, ReactNode> = {
    veterinary: <Stethoscope aria-hidden />,
    assistant: <Dog aria-hidden />,
    secretary: <ClipboardList aria-hidden />,
    equipment_chief: <Wrench aria-hidden />,
  };

  return (
    <div className="space-y-6">
      <PageTitle
        icon={FileText}
        title={t("reportsMessages.title")}
        description={t("reportsMessages.hub.description")}
        breadcrumb={[{ label: t("auth.brandName") }, { label: t("nav.reportsMessages") }]}
      />
      <PageContentShell className="p-6 sm:p-8">
        <p className="mb-6 text-sm font-medium text-muted-foreground">
          {t("reportsMessages.hub.chooseCategory")}
        </p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => (
            <RoleHubCard
              key={category}
              size="large"
              title={t(roleCategoryHubLabelKey(category))}
              description={t(roleCategoryHubDescriptionKey(category))}
              href={roleCategoryPath(category)}
              icon={categoryIcons[category]}
              actionLabel={t("reportsMessages.hub.openCategory")}
            />
          ))}
        </div>
      </PageContentShell>
    </div>
  );
}
