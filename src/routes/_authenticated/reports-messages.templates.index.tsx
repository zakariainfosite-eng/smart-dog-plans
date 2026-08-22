import { createFileRoute } from "@tanstack/react-router";
import { DocumentTemplatesManagementPage } from "@/components/reports-messages/document-templates-management-page";

export const Route = createFileRoute("/_authenticated/reports-messages/templates/")({
  head: () => ({ meta: [{ title: "Gestion des modèles — CynoPlanning" }] }),
  component: DocumentTemplatesManagementPage,
});
