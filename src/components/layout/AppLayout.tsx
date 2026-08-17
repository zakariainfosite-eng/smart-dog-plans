import { Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ExclusionReminderAlertDialog } from "@/components/notifications/exclusion-reminder-alert-dialog";
import { useExclusionReturnNotificationsSync } from "@/hooks/use-exclusion-return-notifications-sync";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";

export function AppLayout() {
  useExclusionReturnNotificationsSync();
  const { notificationsEnabled } = useUiPreferences();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <Header />
        <main className="flex-1">
          <div className="page-enter mx-auto w-full max-w-[1400px] px-4 pb-6 pt-0 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
      {notificationsEnabled ? <ExclusionReminderAlertDialog /> : null}
    </SidebarProvider>
  );
}
