import { createFileRoute } from "@tanstack/react-router";
import { DocumentTemplateEditorPage } from "@/components/reports-messages/document-template-editor-page";

export const Route = createFileRoute("/_authenticated/reports-messages/templates/$templateId")({
  head: () => ({ meta: [{ title: "Éditeur de modèle — CynoPlanning" }] }),
  component: TemplateEditorRoute,
});

function TemplateEditorRoute() {
  const { templateId } = Route.useParams();
  return <DocumentTemplateEditorPage templateId={templateId} />;
}
