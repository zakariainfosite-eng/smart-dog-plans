import { createFileRoute } from "@tanstack/react-router";
import { Building2, Palette, Settings } from "lucide-react";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { useTheme } from "@/components/theme-provider";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — Smart K9 Planning" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  useDocumentTitle("meta.settings.title");
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6 pb-8">
      <PageTitle icon={Settings} title={t("settings.title")} description={t("settings.description")} />

      <div className="grid max-w-3xl gap-4">
        <PageContentShell padding={false} className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-border p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
              <Palette className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t("settings.appearance.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("settings.appearance.description")}</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-5">
            <Label htmlFor="dark-mode">{t("settings.appearance.darkMode")}</Label>
            <Switch id="dark-mode" checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        </PageContentShell>

        <PageContentShell padding={false} className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-border p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted via-muted/80 to-muted/60 text-muted-foreground">
              <Building2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t("settings.organization.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("settings.organization.description")}</p>
            </div>
          </div>
          <div className="p-5 text-sm text-muted-foreground">{t("settings.organization.placeholder")}</div>
        </PageContentShell>
      </div>
    </div>
  );
}
