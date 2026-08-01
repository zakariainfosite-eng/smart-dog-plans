import type { DbClient } from "@/integrations/database/client";

/** Delete a saved planning and its related rotation history rows for that date. */
export async function deleteStoredPlanning(
  client: DbClient,
  planningId: string,
): Promise<void> {
  const { data: planning, error: planningError } = await client
    .from("planning")
    .select("id, planning_date")
    .eq("id", planningId)
    .single();

  if (planningError) throw planningError;

  const { data: assignments, error: assignmentError } = await client
    .from("planning_assignments")
    .select("agent_id")
    .eq("planning_id", planningId);

  if (assignmentError) throw assignmentError;

  const agentIds = [
    ...new Set((assignments ?? []).map((row: { agent_id: string }) => row.agent_id)),
  ];

  if (agentIds.length > 0) {
    const { error: historyError } = await client
      .from("rotation_history")
      .delete()
      .eq("planning_date", planning.planning_date)
      .in("agent_id", agentIds);

    if (historyError) throw historyError;
  }

  const { error: deleteError } = await client.from("planning").delete().eq("id", planningId);
  if (deleteError) throw deleteError;
}
