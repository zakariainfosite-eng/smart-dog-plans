import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import "@/lib/i18n";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { getAuthProvider } from "@/integrations/auth";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useI18n } from "@/hooks/use-i18n";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("error.pageNotFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("error.pageNotFoundDesc")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-[42px] items-center justify-center rounded-[10px] bg-[#023A84] px-[18px] text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-200 hover:bg-[#0349A5] active:scale-[0.98] active:bg-[#012E68]"
          >
            {t("action.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("error.pageLoadFailed")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("error.pageLoadFailedDesc")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-[42px] items-center justify-center rounded-[10px] bg-[#023A84] px-[18px] text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-200 hover:bg-[#0349A5] active:scale-[0.98] active:bg-[#012E68]"
          >
            {t("action.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex h-[42px] items-center justify-center rounded-[10px] border border-[#D1D5DB] bg-white px-[18px] text-sm font-semibold text-[#023A84] shadow-sm transition-[background-color,transform] duration-200 hover:bg-[#F8FAFC] active:scale-[0.98]"
          >
            {t("action.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CynoPlanning — Console de gestion K9" },
      {
        name: "description",
        content:
          "Console d'administration professionnelle pour la gestion des unités K9 et la planification.",
      },
      { property: "og:title", content: "CynoPlanning" },
      {
        property: "og:description",
        content: "Console d'administration pour la gestion des unités K9 et la planification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Raleway:wght@700;800&display=swap",
      },
      { rel: "icon", href: "/logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/logo.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = getAuthProvider().onAuthStateChange((session, event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return unsubscribe;
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <Outlet />
            <Toaster />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
