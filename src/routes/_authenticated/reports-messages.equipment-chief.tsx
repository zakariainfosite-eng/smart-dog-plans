import { createFileRoute } from "@tanstack/react-router";
import { RoleReportsPage } from "@/components/reports-messages/role-reports-page";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/reports-messages/equipment-chief")({
  head: () => ({
    meta: [{ title: "Rapports & Messages — Chef matériel — CynoPlanning" }],
  }),
  component: EquipmentChiefReportsRoute,
});

function EquipmentChiefReportsRoute() {
  useDocumentTitle("meta.reportsMessages.equipmentChief");
  return <RoleReportsPage roleCategory="equipment_chief" />;
}
