import type { TFunction } from "i18next";

import { bucketPlanningDisplayWarnings } from "@/lib/planning/planning-warning-presentation";
import {
  collectPlanningResultAgentNames,
  filterPlanningWarningsForSelectedSection,
} from "@/lib/planning/filter-planning-warnings";
import { translatePlanningReason, translatePoint653Reason } from "@/lib/planning-i18n";
import type { PlanningEngineResult } from "@/lib/planning/engine";
import { compareMatriculeAsc } from "@/lib/documents/sort-attendance-by-matricule";

export type DailyPlanningUiPipelineContext = {
  sectionId: string;
  sectionName: string;
  otherSectionNames: readonly string[];
  t: TFunction;
};

export type DailyPlanningUiPipelineFailure = {
  phase: string;
  message: string;
  path?: string;
  value?: unknown;
  stack?: string;
};

export type DailyPlanningUiPipelineReport = {
  ok: boolean;
  failures: DailyPlanningUiPipelineFailure[];
  displayWarningCount: number;
  engineWarningCount: number;
  summaryKeys: string[];
};

function fail(
  phase: string,
  message: string,
  extra?: Partial<DailyPlanningUiPipelineFailure>,
): DailyPlanningUiPipelineFailure {
  return { phase, message, ...extra };
}

/**
 * Exercises the same data-touching steps as `daily-planning.tsx` after `setResult(engineResult)`.
 * Does not throw by default — returns structured failures for console / tests.
 */
export function auditDailyPlanningUiPipeline(
  engineResult: PlanningEngineResult,
  context: DailyPlanningUiPipelineContext,
): DailyPlanningUiPipelineReport {
  const failures: DailyPlanningUiPipelineFailure[] = [];
  let displayWarningCount = 0;

  const pushErr = (phase: string, error: unknown, path?: string, value?: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    failures.push(
      fail(phase, err.message, {
        path,
        value,
        stack: err.stack,
      }),
    );
  };

  const summary = engineResult.summary;
  if (!summary || typeof summary !== "object") {
    failures.push(fail("summary", "engineResult.summary is missing or not an object"));
    return {
      ok: false,
      failures,
      displayWarningCount: 0,
      engineWarningCount: 0,
      summaryKeys: [],
    };
  }

  const summaryKeys = Object.keys(summary);

  for (const key of [
    "totalEmployees",
    "assignedToCheckpoints",
    "restEmployees",
    "point653Employees",
    "fullyStaffedCheckpoints",
    "understaffedCheckpoints",
    "agentExclusionCount",
  ] as const) {
    const value = summary[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      failures.push(
        fail("summary", `summary.${key} is not a finite number`, {
          path: `summary.${key}`,
          value,
        }),
      );
    }
  }

  if (!Array.isArray(engineResult.checkpoints)) {
    failures.push(fail("checkpoints", "engineResult.checkpoints is not an array"));
  }
  if (!Array.isArray(engineResult.point653)) {
    failures.push(fail("point653", "engineResult.point653 is not an array"));
  }
  if (!Array.isArray(engineResult.offDuty)) {
    failures.push(fail("offDuty", "engineResult.offDuty is not an array"));
  }
  if (!Array.isArray(engineResult.agentExclusions)) {
    failures.push(fail("agentExclusions", "engineResult.agentExclusions is not an array"));
  }

  try {
    const sectionAgentNames = collectPlanningResultAgentNames(engineResult);
    const displayWarnings = filterPlanningWarningsForSelectedSection(summary.warnings, {
      sectionId: context.sectionId,
      sectionName: context.sectionName,
      otherSectionNames: [...context.otherSectionNames],
      sectionAgentNames,
    });
    displayWarningCount = displayWarnings.length;
    bucketPlanningDisplayWarnings(displayWarnings, context.t);
  } catch (error) {
    pushErr("alerts-panel", error, "displayWarnings / bucketPlanningDisplayWarnings", {
      warnings: summary.warnings,
      warningsType: Array.isArray(summary.warnings) ? "array" : typeof summary.warnings,
    });
  }

  try {
    const criticalCount = (summary.warnings ?? []).filter((w) =>
      typeof w === "string" ? /^\[|^INVALID:|^UNDERSTAFFED/i.test(w) : false,
    ).length;
    if (typeof criticalCount !== "number") {
      failures.push(fail("coverageReport", "critical warning count invalid"));
    }
  } catch (error) {
    pushErr("coverageReport", error, "summary.warnings filter");
  }

  const checkpointsWithDemand = (engineResult.checkpoints ?? []).filter(
    (c) => c.total_required > 0,
  );

  for (const cp of checkpointsWithDemand) {
    try {
      if (!Array.isArray(cp.slots)) {
        throw new Error(`checkpoint ${cp.checkpoint_name}: slots is not an array`);
      }
      if (!Array.isArray(cp.posts)) {
        throw new Error(`checkpoint ${cp.checkpoint_name}: posts is not an array`);
      }
      [...cp.slots].sort((a, b) => {
        const aMle = a.team?.professional_number ?? "";
        const bMle = b.team?.professional_number ?? "";
        if (!a.team && b.team) return 1;
        if (a.team && !b.team) return -1;
        return compareMatriculeAsc(aMle, bMle);
      });
      for (const post of cp.posts) {
        void context.t(`specialty.${post.specialty_required}`);
      }
      for (const slot of cp.slots) {
        void context.t(`specialty.${slot.specialty_required}`);
      }
    } catch (error) {
      pushErr("checkpoint-table", error, `checkpoints.${cp.checkpoint_id}`, cp);
    }
  }

  for (const entry of engineResult.point653 ?? []) {
    try {
      translatePoint653Reason(entry.reason, context.t);
    } catch (error) {
      pushErr("point653-list", error, `point653.${entry.agent_id}`, entry);
    }
  }

  for (const entry of engineResult.agentExclusions ?? []) {
    try {
      translatePlanningReason(entry.reason, context.t);
    } catch (error) {
      pushErr("agent-exclusions-list", error, `agentExclusions.${entry.agent_id}`, entry);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    displayWarningCount,
    engineWarningCount: Array.isArray(summary.warnings) ? summary.warnings.length : 0,
    summaryKeys,
  };
}

/**
 * Runs the UI pipeline and throws a single Error with full diagnostic text (for tests).
 */
export function assertDailyPlanningUiPipeline(
  engineResult: PlanningEngineResult,
  context: DailyPlanningUiPipelineContext,
): void {
  const report = auditDailyPlanningUiPipeline(engineResult, context);
  if (report.ok) return;
  const detail = report.failures
    .map(
      (f) =>
        `[${f.phase}] ${f.message}${f.path ? ` @ ${f.path}` : ""}${
          f.stack ? `\n${f.stack.split("\n").slice(0, 5).join("\n")}` : ""
        }`,
    )
    .join("\n\n");
  throw new Error(`Daily planning UI pipeline failed:\n${detail}`);
}
