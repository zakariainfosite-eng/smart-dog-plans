import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers,
  Users,
  Dog,
  MapPin,
  UserX,
  Briefcase,
  CalendarDays,
  History,
  FileBarChart,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppLogo } from "@/components/brand/app-logo";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

const items = [
  { key: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "nav.sections", url: "/sections", icon: Layers },
  { key: "nav.employees", url: "/employees", icon: Users },
  { key: "nav.dogs", url: "/dogs", icon: Dog },
  { key: "nav.checkpoints", url: "/checkpoints", icon: MapPin },
  { key: "nav.exclusions", url: "/exclusions", icon: UserX },
  { key: "nav.operationalCases", url: "/operational-cases", icon: Briefcase },
  { key: "nav.dailyPlanning", url: "/daily-planning", icon: CalendarDays },
  { key: "nav.history", url: "/history", icon: History },
  { key: "nav.statistics", url: "/statistics", icon: FileBarChart },
  { key: "nav.settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useI18n();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    currentPath === path || currentPath.startsWith(path + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border shadow-soft">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="flex items-center justify-center px-1">
          <AppLogo
            className={cn(
              "w-auto max-w-full object-contain transition-[height] duration-200",
              collapsed ? "h-9" : "h-11 lg:h-14",
            )}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("nav.group")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const label = t(item.key);
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={label}
                      className="h-10"
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 2} />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
