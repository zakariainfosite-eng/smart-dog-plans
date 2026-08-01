import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthProvider } from "@/integrations/auth";
import { AppLayout } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await getAuthProvider().getSession();
    if (!session?.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: session.user };
  },
  component: AppLayout,
});
