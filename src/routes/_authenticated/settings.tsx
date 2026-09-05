import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { PageTitle } from "@/components/layout/PageTitle";
import { AppearancePreferencesCard } from "@/components/settings/appearance-preferences-card";
import { DataSettingsCard } from "@/components/settings/data-settings-card";
import { DocumentSettingsCard } from "@/components/settings/document-settings-card";
import { ExclusionSettingsCard } from "@/components/settings/exclusion-settings-card";
import { OrganizationSettingsCard } from "@/components/settings/organization-settings-card";
import { PlanningSettingsCard } from "@/components/settings/planning-settings-card";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — CynoPlanning" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  useDocumentTitle("meta.settings.title");

  return (
    <div className="w-full min-w-0 space-y-5 pb-8">
      <PageTitle icon={Settings} title={t("settings.title")} description={t("settings.description")} />

      <div className="grid w-full min-w-0 gap-4">
        <AppearancePreferencesCard />
        <OrganizationSettingsCard />
        <PlanningSettingsCard />
        <ExclusionSettingsCard />
        <DocumentSettingsCard />
        <DataSettingsCard />
      </div>
    </div>
  );
}
