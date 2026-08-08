import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User as UserIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { getAuthProvider } from "@/integrations/auth";

export function Header() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initials =
    user?.email
      ?.split("@")[0]
      .slice(0, 2)
      .toUpperCase() ?? "SK";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await getAuthProvider().signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="glass-header sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
      <SidebarTrigger className="rounded-[calc(var(--radius)-2px)]" />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb />

      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-3">
              <Avatar className="h-8 w-8 shadow-soft">
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[160px] truncate text-sm font-medium sm:inline">
                {user?.email ?? t("account.fallback")}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-[var(--radius)]">
            <DropdownMenuLabel>{t("account.my")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg">
              <UserIcon className="mr-2 h-4 w-4" />
              {t("action.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} className="rounded-lg">
              <LogOut className="mr-2 h-4 w-4" />
              {t("action.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
