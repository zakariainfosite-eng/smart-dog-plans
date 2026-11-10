import { parseISO } from "date-fns";

import type { DbClient } from "@/integrations/database/client";
import { fetchActiveExclusionsForDate } from "@/lib/agent-exclusions";
import { syncAndroidPlanningNotificationsSafe } from "@/lib/notifications/sync-android-planning-notifications";
import {
  findStoredPlanningSlotConflicts,
  type StoredPlanningSlotConflict,
} from "@/lib/planning/stored-planning-exclusion-conflicts";
import { loadPlanningContext } from "@/lib/planning/load-planning-context";
import { loadStoredPlanningDetail } from "@/lib/planning/load-stored-planning-detail";
import {
  runPlanningEngine,
  type ExclusionPatchOptions,
  type PlanningEngineResult,
  type Shift,
} from "@/lib/planning/engine";

export type ExclusionReplacementWarning = {
  checkpointName: string;
  planningDateISO: string;
  message: string;
};

export function formatExclusionReplacementWarning(
  checkpointName: string,
  planningDateISO: string,
): string {
  return `Aucun remplaçant disponible pour ${checkpointName} — ${planningDateISO}.`;
}

export type PatchStoredPlanningExclusionResult = {
  planningId: string;
  planningDateISO: string;
  patched: boolean;
  replacements: Array<{
    checkpointName: string;
    checkpointPostId: string | null;
    previousAgentId: string;
    nextAgentId: string | null;
  }>;
  warnings: ExclusionReplacementWarning[];
};

function buildExclusionPatchOptions(
  stored: PlanningEngineResult,
  conflicts: StoredPlanningSlotConflict[],
): ExclusionPatchOptions {
  const openCheckpointPostIds = new Set(
    conflicts.filter((c) => c.kind === "checkpoint" && c.checkpointPostId).map((c) => c.checkpointPostId!),
  );
  const conflictAgentIds = new Set(conflicts.map((c) => c.agentId));
  const hqConflictCount = conflicts.filter((c) => c.kind === "hq_reserve").length;

  const preservedAssignments = stored.assignments.filter(
    (row) => !openCheckpointPostIds.has(row.checkpoint_post_id),
  );

  const preservedPoint653 = stored.point653.filter((row) => !conflictAgentIds.has(row.agent_id));

  return {
    openCheckpointPostIds,
    preservedAssignments,
    preservedPoint653,
    preservedOffDuty: [...stored.offDuty],
    point653ReplacementCount: hqConflictCount,
  };
}

function collectOpenPostWarnings(
  patch: ExclusionPatchOptions,
  engineResult: PlanningEngineResult,
  planningDateISO: string,
  conflicts: StoredPlanningSlotConflict[],
): ExclusionReplacementWarning[] {
  const warnings: ExclusionReplacementWarning[] = [];
  const assignmentByPost = new Map(
    engineResult.assignments.map((row) => [row.checkpoint_post_id, row]),
  );

  for (const postId of patch.openCheckpointPostIds) {
    const conflict = conflicts.find((c) => c.checkpointPostId === postId);
    if (!conflict) continue;
    if (assignmentByPost.has(postId)) continue;

    warnings.push({
      checkpointName: conflict.checkpointName,
      planningDateISO,
      message: formatExclusionReplacementWarning(conflict.checkpointName, planningDateISO),
    });
  }

  if (patch.point653ReplacementCount > 0) {
    const needed = patch.point653ReplacementCount;
    const preservedCount = patch.preservedPoint653.length;
    const nextCount = engineResult.point653.length;
    if (nextCount - preservedCount < needed) {
      warnings.push({
        checkpointName: "Point 653",
        planningDateISO,
        message: formatExclusionReplacementWarning("Point 653", planningDateISO),
      });
    }
  }

  return warnings;
}

function replacementSummary(
  conflicts: StoredPlanningSlotConflict[],
  previous: PlanningEngineResult,
  next: PlanningEngineResult,
): PatchStoredPlanningExclusionResult["replacements"] {
  return conflicts.map((conflict) => {
    if (conflict.kind === "checkpoint" && conflict.checkpointPostId) {
      const nextRow = next.assignments.find(
        (row) => row.checkpoint_post_id === conflict.checkpointPostId,
      );
      return {
        checkpointName: conflict.checkpointName,
        checkpointPostId: conflict.checkpointPostId,
        previousAgentId: conflict.agentId,
        nextAgentId: nextRow?.agent_id ?? null,
      };
    }

    const preservedIds = new Set(previous.point653.map((row) => row.agent_id));
    const added = next.point653.find((row) => !preservedIds.has(row.agent_id));
    return {
      checkpointName: conflict.checkpointName,
      checkpointPostId: null,
      previousAgentId: conflict.agentId,
      nextAgentId: added?.agent_id ?? null,
    };
  });
}

async function persistAssignmentReplacements(
  client: DbClient,
  planningId: string,
  planningDateISO: string,
  conflicts: StoredPlanningSlotConflict[],
  engineResult: PlanningEngineResult,
  patch: ExclusionPatchOptions,
): Promise<void> {
  for (const conflict of conflicts) {
    if (conflict.kind === "checkpoint" && conflict.checkpointPostId) {
      const { error: deleteError } = await client
        .from("planning_assignments")
        .delete()
        .eq("planning_id", planningId)
        .eq("checkpoint_post_id", conflict.checkpointPostId)
        .eq("agent_id", conflict.agentId);
      if (deleteError) throw deleteError;

      const nextRow = engineResult.assignments.find(
        (row) => row.checkpoint_post_id === conflict.checkpointPostId,
      );
      if (!nextRow) {
        await client
          .from("rotation_history")
          .delete()
          .eq("planning_date", planningDateISO)
          .eq("agent_id", conflict.agentId)
          .eq("checkpoint_post_id", conflict.checkpointPostId);
        continue;
      }

      const { error: insertError } = await client.from("planning_assignments").insert({
        planning_id: planningId,
        checkpoint_post_id: nextRow.checkpoint_post_id,
        agent_id: nextRow.agent_id,
        dog_id: nextRow.dog_id,
        is_hq_reserve: false,
        is_off_duty: false,
      });
      if (insertError) throw insertError;

      await client
        .from("rotation_history")
        .delete()
        .eq("planning_date", planningDateISO)
        .eq("agent_id", conflict.agentId)
        .eq("checkpoint_post_id", conflict.checkpointPostId);

      const { error: historyError } = await client.from("rotation_history").insert({
        agent_id: nextRow.agent_id,
        checkpoint_post_id: nextRow.checkpoint_post_id,
        planning_date: planningDateISO,
        is_hq_reserve: false,
        is_off_duty: false,
      });
      if (historyError) throw historyError;
    }
  }

  const preserved653Ids = new Set(patch.preservedPoint653.map((row) => row.agent_id));
  const added653 = engineResult.point653.filter((row) => !preserved653Ids.has(row.agent_id));
  let addedIndex = 0;

  for (const conflict of conflicts.filter((c) => c.kind === "hq_reserve")) {
    const { error: deleteError } = await client
      .from("planning_assignments")
      .delete()
      .eq("planning_id", planningId)
      .eq("agent_id", conflict.agentId)
      .eq("is_hq_reserve", true);
    if (deleteError) throw deleteError;

    await client
      .from("rotation_history")
      .delete()
      .eq("planning_date", planningDateISO)
      .eq("agent_id", conflict.agentId)
      .eq("is_hq_reserve", true);

    const replacement = added653[addedIndex++];
    if (!replacement) continue;

    const { error: insertError } = await client.from("planning_assignments").insert({
      planning_id: planningId,
      checkpoint_post_id: null,
      agent_id: replacement.agent_id,
      dog_id: replacement.dog_id,
      is_hq_reserve: true,
      is_off_duty: false,
    });
    if (insertError) throw insertError;

    const { error: historyError } = await client.from("rotation_history").insert({
      agent_id: replacement.agent_id,
      checkpoint_post_id: null,
      planning_date: planningDateISO,
      is_hq_reserve: true,
      is_off_duty: false,
    });
    if (historyError) throw historyError;
  }
}

/**
 * Replaces only assignments that conflict with exclusions active on the planning date.
 * Reuses {@link runPlanningEngine} with {@link ExclusionPatchOptions} (assignOpenSlots + Smart Rotation).
 */
export async function patchStoredPlanningForExclusions(
  client: DbClient,
  planningId: string,
): Promise<PatchStoredPlanningExclusionResult> {
  const detail = await loadStoredPlanningDetail(client, planningId);
  const planningDateISO = detail.planning_date;
  const exclusions = await fetchActiveExclusionsForDate(client, planningDateISO);

  const conflicts = findStoredPlanningSlotConflicts(
    planningDateISO,
    detail.engineResult,
    exclusions,
  );

  if (conflicts.length === 0) {
    return {
      planningId,
      planningDateISO,
      patched: false,
      replacements: [],
      warnings: [],
    };
  }

  const context = await loadPlanningContext(
    client,
    planningDateISO,
    detail.section.id,
    parseISO(planningDateISO),
  );

  const patchOptions = buildExclusionPatchOptions(detail.engineResult, conflicts);

  const engineResult = runPlanningEngine({
    sectionId: detail.section.id,
    agents: context.agents,
    exclusions: context.exclusions,
    checkpoints: context.checkpoints,
    shift: detail.shift as Shift,
    planningDate: parseISO(planningDateISO),
    rotationHistory: context.rotationHistory,
    yesterdayCheckpointByAgent: context.yesterdayCheckpointByAgent,
    fairnessCounts: context.fairnessCounts,
    exclusionDebug: context.exclusionDebug,
    exclusionPatch: patchOptions,
  });

  const warnings = collectOpenPostWarnings(patchOptions, engineResult, planningDateISO, conflicts);
  const replacements = replacementSummary(conflicts, detail.engineResult, engineResult);

  await persistAssignmentReplacements(
    client,
    planningId,
    planningDateISO,
    conflicts,
    engineResult,
    patchOptions,
  );
  await syncAndroidPlanningNotificationsSafe(client);

  return {
    planningId,
    planningDateISO,
    patched: true,
    replacements,
    warnings,
  };
}
