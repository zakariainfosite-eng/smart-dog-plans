import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";

import {
  PageHero,
  type PageHeroAction,
  type PageHeroMetaItem,
} from "@/components/enterprise/page-layout";

interface PageTitleProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  meta?: PageHeroMetaItem[];
  actions?: ReactNode;
  heroActions?: PageHeroAction[];
  loading?: boolean;
}

export function PageTitle({
  title,
  description,
  icon = LayoutGrid,
  meta,
  actions,
  heroActions,
  loading,
}: PageTitleProps) {
  return (
    <PageHero
      icon={icon}
      title={title}
      subtitle={description}
      meta={meta}
      actions={heroActions}
      actionsSlot={actions}
      loading={loading}
    />
  );
}

export type { PageHeroMetaItem, PageHeroAction };
