import type { ReactNode } from "react";
import { Bell, Globe, Palette, Rows3, SunMedium, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "@/components/theme-provider";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n, type Locale } from "@/hooks/use-i18n";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import type { UiDensity } from "@/lib/ui-preferences";

function PreferenceRow({
  icon: Icon,
  title,
  description,
  htmlFor,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {title}
          </Label>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center sm:justify-end">{children}</div>
    </div>
  );
}

export function AppearancePreferencesCard() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { density, setDensity, notificationsEnabled, setNotificationsEnabled } = useUiPreferences();

  const languageValue: Locale = locale === "ar" ? "ar" : "fr";

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
            <Palette className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.appearance.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.appearance.description")}</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        <PreferenceRow
          icon={Globe}
          title={t("settings.appearance.language")}
          description={t("settings.appearance.languageDescription")}
        >
          <Select
            value={languageValue}
            onValueChange={(value) => {
              if (value === "fr" || value === "ar") setLocale(value);
            }}
          >
            <SelectTrigger className="w-full sm:w-[13.5rem]" aria-label={t("settings.appearance.language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">{t("language.french")}</SelectItem>
              <SelectItem value="ar">{t("language.arabic")}</SelectItem>
            </SelectContent>
          </Select>
        </PreferenceRow>

        <PreferenceRow
          icon={SunMedium}
          title={t("settings.appearance.theme")}
          description={t("settings.appearance.themeDescription")}
        >
          <Select
            value={theme}
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system") {
                setTheme(value as ThemePreference);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[13.5rem]" aria-label={t("settings.appearance.theme")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("settings.appearance.themeLight")}</SelectItem>
              <SelectItem value="dark">{t("settings.appearance.themeDark")}</SelectItem>
              <SelectItem value="system">{t("settings.appearance.themeSystem")}</SelectItem>
            </SelectContent>
          </Select>
        </PreferenceRow>

        <PreferenceRow
          icon={Rows3}
          title={t("settings.appearance.density")}
          description={t("settings.appearance.densityDescription")}
        >
          <Select
            value={density}
            onValueChange={(value) => {
              if (value === "compact" || value === "normal" || value === "comfortable") {
                setDensity(value as UiDensity);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[13.5rem]" aria-label={t("settings.appearance.density")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">{t("settings.appearance.densityCompact")}</SelectItem>
              <SelectItem value="normal">{t("settings.appearance.densityNormal")}</SelectItem>
              <SelectItem value="comfortable">{t("settings.appearance.densityComfortable")}</SelectItem>
            </SelectContent>
          </Select>
        </PreferenceRow>

        <PreferenceRow
          icon={Bell}
          htmlFor="settings-notifications-enabled"
          title={t("settings.appearance.notifications")}
          description={t("settings.appearance.notificationsDescription")}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {t("settings.appearance.notificationsEnable")}
            </span>
            <Switch
              id="settings-notifications-enabled"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
              aria-label={t("settings.appearance.notificationsEnable")}
            />
          </div>
        </PreferenceRow>
      </div>
    </PageContentShell>
  );
}
