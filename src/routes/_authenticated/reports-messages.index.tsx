import { createFileRoute } from "@tanstack/react-router";
import { ReportsMessagesHubPage } from "@/components/reports-messages/role-reports-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/reports-messages/")({
  head: () => ({ meta: [{ title: "Rapports & Messages — CynoPlanning" }] }),
  component: ReportsMessagesHubRoute,
});

function ReportsMessagesHubRoute() {
  useDocumentTitle("meta.reportsMessages.title");
  return <ReportsMessagesHubPage />;
}
