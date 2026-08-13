import { createFileRoute } from "@tanstack/react-router";
import { RoleReportsPage } from "@/components/reports-messages/role-reports-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/reports-messages/assistant")({
  head: () => ({ meta: [{ title: "Rapports — Assistant cynotechnique — CynoPlanning" }] }),
  component: AssistantReportsRoute,
});

function AssistantReportsRoute() {
  useDocumentTitle("meta.reportsMessages.assistant");
  return <RoleReportsPage roleCategory="assistant" />;
}
