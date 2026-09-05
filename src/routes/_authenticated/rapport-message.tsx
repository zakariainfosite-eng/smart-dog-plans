import { createFileRoute } from "@tanstack/react-router";
import { RapportMessagePage } from "@/components/rapport-message/rapport-message-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/rapport-message")({
  head: () => ({ meta: [{ title: "Rapport / Message — CynoPlanning" }] }),
  component: RapportMessageRoute,
});

function RapportMessageRoute() {
  useDocumentTitle("meta.rapportMessage.title");
  return <RapportMessagePage />;
}
