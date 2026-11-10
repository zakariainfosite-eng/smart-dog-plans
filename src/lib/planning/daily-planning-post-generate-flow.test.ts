import { describe, expect, it } from "vitest";

import fr from "@/locales/fr.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  assertDailyPlanningUiPipeline,
  auditDailyPlanningUiPipeline,
} from "@/lib/planning/daily-planning-ui-pipeline";
import { runPlanningEngine, type AgentInput, type CheckpointInput } from "@/lib/planning/engine";

void i18n.use(initReactI18next).init({
  lng: "fr",
  resources: { fr: { translation: fr } },
});

const t = i18n.t.bind(i18n);

const post = (id: string, specialty: "narcotics" | "explosives", gender: "all" | "male" = "all") => ({
  id,
  shift: "day" as const,
  specialty_required: specialty,
  required_agents: 1,
  active: true,
  allowed_gender: gender,
  dog_required: true,
});

function cp(
  id: string,
  name: string,
  priority: 1 | 2 | 3 | 4,
  opts?: { female_policy?: "allowed" | "preferred" | "not_allowed"; posts?: ReturnType<typeof post>[] },
): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: opts?.female_policy ?? "allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: opts?.posts ?? [post(`p-${id}`, "explosives")],
  };
}

function male(id: string, sectionId = "sec1"): AgentInput {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: id.toUpperCase(),
    gender: "male",
    active: true,
    section_id: sectionId,
    dog_id: `d-${id}`,
    dogs: {
      id: `d-${id}`,
      name: id,
      specialty: "explosives",
      status: "available",
      active: true,
    },
  };
}

const uiContext = {
  sectionId: "sec1",
  sectionName: "1ère Section",
  otherSectionNames: ["2ème Section", "3ème Section"],
  t,
};

describe("daily planning post-generate flow (engine → filter → alerts → table)", () => {
  it("understaffed + NO_ELIGIBLE_AGENT warnings", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 6, 27),
      agents: [],
      exclusions: [],
      checkpoints: [cp("cp-20", "20", 1, { posts: [post("p1", "explosives", "male")] })],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    expect(result.summary.warnings.some((w) => w.includes("[NO_ELIGIBLE_AGENT]"))).toBe(true);
    assertDailyPlanningUiPipeline(result, uiContext);
  });

  it("multi-checkpoint assignment with P1/P2 and Point 653 pool", () => {
    const checkpoints = [cp("cp-p2", "20", 2), cp("cp-p1", "91", 1)];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 2),
      agents: [male("m1"), male("m2"), male("m3")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    assertDailyPlanningUiPipeline(result, uiContext);
  });

  it("agent exclusions list uses translatePlanningReason (same as daily-planning.tsx)", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 2),
      agents: [male("m1")],
      exclusions: [],
      checkpoints: [cp("cp-p1", "91", 1)],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    result.agentExclusions.push({
      agent_id: "m1",
      agent_name: "M m1",
      professional_number: "M1",
      dog_id: null,
      dog_name: null,
      specialty: null,
      reason: "Sick",
    });
    assertDailyPlanningUiPipeline(result, uiContext);
  });

  it("tolerates undefined-shaped warnings like legacy persisted payloads", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 2),
      agents: [male("m1")],
      exclusions: [],
      checkpoints: [cp("cp-p1", "91", 1)],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    (result.summary as { warnings?: unknown }).warnings = undefined;
    const report = auditDailyPlanningUiPipeline(result, uiContext);
    expect(report.ok).toBe(true);
    expect(report.displayWarningCount).toBe(0);
  });
});
