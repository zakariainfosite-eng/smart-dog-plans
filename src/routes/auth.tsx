import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { getAuthProvider } from "@/integrations/auth";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AppLogo } from "@/components/brand/app-logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — Smart K9 Planning" },
      { name: "description", content: "Connectez-vous à la console d'administration Smart K9 Planning." },
    ],
  }),
  component: AuthPage,
});

function AuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#F8FAFC]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#EFF6FF] via-[#F8FAFC] to-[#FFFFFF]" />
      <div className="auth-orb absolute -left-[18%] -top-[14%] h-[420px] w-[420px] rounded-full bg-[#2563EB]/[0.06] blur-[100px]" />
      <div className="auth-orb-reverse absolute -right-[14%] -top-[10%] h-[360px] w-[360px] rounded-full bg-[#1D4ED8]/[0.05] blur-[96px]" />
      <div className="auth-orb-reverse absolute -bottom-[16%] -left-[12%] h-[320px] w-[320px] rounded-full bg-[#3B82F6]/[0.05] blur-[88px]" />
      <div className="auth-orb absolute -bottom-[18%] -right-[16%] h-[400px] w-[400px] rounded-full bg-[#2563EB]/[0.07] blur-[104px]" />
    </div>
  );
}

function AuthCardGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] h-[min(520px,90vw)] w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(219_234_254/0.55)_0%,rgb(239_246_255/0.25)_42%,transparent_72%)]"
    />
  );
}

function AuthPage() {
  const { t } = useI18n();
  useDocumentTitle("meta.auth.title");
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuthProvider();
    const unsubscribe = auth.onAuthStateChange((s) => {
      if (s) navigate({ to: "/dashboard", replace: true });
    });
    auth.getSession().then((session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
      else setChecking(false);
    }).catch(() => setChecking(false));
    return unsubscribe;
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const auth = getAuthProvider();
    try {
      await auth.signInWithPassword(email, password);
      toast.success(t("toast.auth.welcomeBack"));
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message === "Invalid login credentials"
            ? t("error.auth.invalidCredentials")
            : err.message
          : t("error.auth.failed");
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAFC]">
        <AuthBackground />
        <div className="flex flex-col items-center gap-4">
          <AppLogo className="auth-brand-logo opacity-90" />
          <Loader2 className="h-5 w-5 animate-spin text-[#2563EB]" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8FAFC] px-4 py-6 sm:px-6 sm:py-8">
      <AuthBackground />

      <div className="relative mx-auto flex w-full max-w-[440px] flex-col items-center page-enter">
        <AuthCardGlow />
        <AppLogo className="auth-brand-logo" />

        <Card className="auth-glass relative mt-8 w-full overflow-hidden rounded-2xl border border-[#E5E7EB]/80 shadow-[0_1px_2px_rgb(17_24_39/0.03),0_8px_32px_-8px_rgb(29_78_216/0.08)] transition-shadow duration-300 hover:shadow-[0_2px_4px_rgb(17_24_39/0.04),0_12px_40px_-8px_rgb(29_78_216/0.1)]">
          <CardHeader className="space-y-1.5 pb-2 pt-7 text-center sm:px-8">
            <CardTitle className="text-xl font-semibold tracking-tight">{t("auth.cardTitle")}</CardTitle>
            <CardDescription className="text-sm leading-relaxed">{t("auth.cardDescription")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-6 pb-8 sm:px-8">
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {t("field.email")}
                </Label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-[#2563EB]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.placeholder.email")}
                    className="h-12 rounded-xl border-border/80 bg-background/60 ps-10 shadow-soft transition-all duration-200 placeholder:text-muted-foreground/70 focus-visible:border-[#2563EB]/40 focus-visible:bg-background focus-visible:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t("field.password")}
                </Label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-[#2563EB]" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 rounded-xl border-border/80 bg-background/60 ps-10 shadow-soft transition-all duration-200 placeholder:text-muted-foreground/70 focus-visible:border-[#2563EB]/40 focus-visible:bg-background focus-visible:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive transition-all duration-200"
                >
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className={cn(
                  "h-12 w-full rounded-2xl border-0 bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-base font-semibold text-white shadow-[0_4px_20px_-4px_rgb(37_99_235/0.55)] transition-all duration-300",
                  "hover:from-[#1e40af] hover:to-[#1D4ED8] hover:shadow-[0_8px_28px_-4px_rgb(37_99_235/0.6)] hover:-translate-y-0.5",
                  "active:translate-y-0 active:scale-[0.99]",
                  "disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none",
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("auth.submit.signIn")}
                  </>
                ) : (
                  t("auth.submit.signIn")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80 sm:mt-10">
          {t("auth.footer")}
        </p>
      </div>
    </div>
  );
}
