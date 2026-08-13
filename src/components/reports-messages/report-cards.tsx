import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { RoleCategory } from "@/lib/reports-messages/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type RoleHubCardProps = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  actionLabel?: string;
  size?: "default" | "large";
  className?: string;
};

export function RoleHubCard({
  title,
  description,
  href,
  icon,
  actionLabel = "Ouvrir",
  size = "default",
  className,
}: RoleHubCardProps) {
  const large = size === "large";

  return (
    <Link
      to={href}
      className={cn(
        "group flex h-full flex-col rounded-[20px] border border-[#023A84]/10 bg-card",
        "shadow-[0_3px_14px_-4px_rgba(2,58,132,0.10)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-[#023A84]/25 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.16)]",
        large ? "min-h-[220px] p-7 sm:p-8" : "p-5",
        className,
      )}
    >
      <div className="flex flex-1 items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-[#023A84]/10 text-[#023A84]",
            large ? "h-14 w-14 [&>svg]:h-7 [&>svg]:w-7" : "h-11 w-11 text-xl",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-semibold tracking-tight text-[#0B1F3A]",
              large ? "text-lg leading-snug sm:text-xl" : "text-base",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "mt-2 leading-relaxed text-muted-foreground",
              large ? "text-sm sm:text-[15px]" : "mt-1 text-sm",
            )}
          >
            {description}
          </p>
        </div>
      </div>
      <div
        className={cn(
          "mt-5 flex items-center gap-1.5 font-medium text-[#023A84]",
          large ? "text-sm" : "text-sm",
        )}
      >
        <span>{actionLabel}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

type ReportTemplateCardProps = {
  icon: string;
  title: string;
  description: string;
  onCreate: () => void;
  createLabel?: string;
  busy?: boolean;
};

/** @deprecated Use onCreate — kept for assistant/secretary RoleReportsPage compatibility */
type LegacyReportTemplateCardProps = {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
};

export function ReportTemplateCard(
  props: ReportTemplateCardProps | (LegacyReportTemplateCardProps & { onCreate?: never }),
) {
  const onCreate = "onCreate" in props ? props.onCreate : props.onClick;
  const createLabel =
    "createLabel" in props && props.createLabel ? props.createLabel : "Créer un nouveau rapport";
  const busy = "busy" in props ? props.busy : false;
  const { icon, title, description } = props;

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-[18px] border border-[#023A84]/10 bg-card p-5",
        "shadow-[0_3px_14px_-4px_rgba(2,58,132,0.08)] transition-all duration-200",
        "hover:border-[#023A84]/22 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.14)]",
      )}
    >
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <h4 className="mt-3 text-base font-semibold text-[#0B1F3A]">{title}</h4>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <Button
        type="button"
        size="sm"
        className="mt-4 w-full sm:w-auto"
        disabled={busy}
        onClick={onCreate}
      >
        {createLabel}
      </Button>
    </article>
  );
}

export function roleCategoryHubLabelKey(category: RoleCategory): string {
  return `reportsMessages.hub.cards.${category}.title`;
}

export function roleCategoryHubDescriptionKey(category: RoleCategory): string {
  return `reportsMessages.hub.cards.${category}.description`;
}

export function roleCategoryLabelKey(category: RoleCategory): string {
  return `reportsMessages.roles.${category}.title`;
}

export function roleCategoryDescriptionKey(category: RoleCategory): string {
  return `reportsMessages.roles.${category}.description`;
}

export function roleCategoryIcon(category: RoleCategory): string {
  switch (category) {
    case "veterinary":
      return "🩺";
    case "assistant":
      return "🐕";
    case "secretary":
      return "📋";
    case "equipment_chief":
      return "🧰";
  }
}
