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
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppLogo } from "@/components/brand/app-logo";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

type NavItem = {
  key: string;
  url: string;
  icon: LucideIcon;
};

/** Flat order — icon + label only. */
const navItems: NavItem[] = [
  { key: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "nav.employees", url: "/employees", icon: Users },
  { key: "nav.dogs", url: "/dogs", icon: Dog },
  { key: "nav.sections", url: "/sections", icon: Layers },
  { key: "nav.checkpoints", url: "/checkpoints", icon: MapPin },
  { key: "nav.planning", url: "/daily-planning", icon: CalendarDays },
  { key: "nav.exclusions", url: "/exclusions", icon: UserX },
  { key: "nav.operationalCases", url: "/operational-cases", icon: Briefcase },
  { key: "nav.history", url: "/history", icon: History },
  { key: "nav.statistics", url: "/statistics", icon: FileBarChart },
  { key: "nav.settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useI18n();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    currentPath === path || currentPath.startsWith(`${path}/`);

  return (
    <Sidebar collapsible="icon" className="cyno-app-sidebar shadow-none">
      <SidebarHeader className="shrink-0 px-4 pb-4 pt-5">
        <div className="flex items-center justify-center">
          <AppLogo
            className={cn(
              "w-auto max-w-[168px] object-contain transition-[height] duration-200",
              collapsed ? "h-8" : "h-[46px]",
            )}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 pb-4 font-[family-name:var(--font-sans)]">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {navItems.map((item) => {
                const label = t(item.key);
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={label}
                      size="lg"
                      className={cn(
                        "cyno-nav-item h-10 rounded-[10px] pl-4 pr-3 text-[14px] font-medium",
                        "text-[#374151] shadow-none transition-colors duration-150",
                        "hover:bg-[#F8FAFC] hover:text-[#023A84]",
                        "data-[active=true]:bg-[#EAF3FF] data-[active=true]:font-medium data-[active=true]:text-[#023A84]",
                        "data-[active=true]:shadow-none data-[active=true]:hover:bg-[#EAF3FF] data-[active=true]:hover:text-[#023A84]",
                        "group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-0",
                      )}
                    >
                      <Link to={item.url} className="flex w-full items-center gap-2.5">
                        <item.icon
                          className={cn(
                            "h-[17px] w-[17px] shrink-0",
                            active ? "text-[#023A84]" : "text-[#6B7280]",
                          )}
                          strokeWidth={2}
                        />
                        <span className="truncate">{label}</span>
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
