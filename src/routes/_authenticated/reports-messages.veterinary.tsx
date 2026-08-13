import { createFileRoute } from "@tanstack/react-router";
import { VeterinaryReportsPage } from "@/components/reports-messages/veterinary-reports-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/reports-messages/veterinary")({
  head: () => ({
    meta: [{ title: "Rapports & Messages — Aide-soignant vétérinaire — CynoPlanning" }],
  }),
  component: VeterinaryReportsRoute,
});

function VeterinaryReportsRoute() {
  useDocumentTitle("meta.reportsMessages.veterinary");
  return <VeterinaryReportsPage />;
}
