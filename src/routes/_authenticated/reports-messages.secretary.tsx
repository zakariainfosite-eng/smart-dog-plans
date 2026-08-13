import { createFileRoute } from "@tanstack/react-router";
import { RoleReportsPage } from "@/components/reports-messages/role-reports-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/reports-messages/secretary")({
  head: () => ({ meta: [{ title: "Rapports — Secrétaire — CynoPlanning" }] }),
  component: SecretaryReportsRoute,
});

function SecretaryReportsRoute() {
  useDocumentTitle("meta.reportsMessages.secretary");
  return <RoleReportsPage roleCategory="secretary" />;
}
