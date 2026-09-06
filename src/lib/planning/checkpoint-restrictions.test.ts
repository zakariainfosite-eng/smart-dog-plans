import { describe, expect, it } from "vitest";
import {
  classifyUnfilledSlotReason,
  isAgentRestrictedFromCheckpoint,
  qualifyTeams,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
} from "./engine";

const PLANNING_DATE = new Date(2026, 7, 22);
const SECTION_ID = "sec-restrict";

function maleHandler(id: string, specialty: "explosives" | "narcotics" = "explosives"): AgentInput {
  return {
    id,
    first_name: "Male",
    last_name: id,
    professional_number: id,
    gender: "male",
    active: true,
    section_id: SECTION_ID,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: `Dog-${id}`,
      specialty,
      status: "available",
      active: true,
    },
  };
}

function checkpoint(
  id: string,
  name: string,
  restrictedAgentIds: string[] = [],
): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "male",
    female_policy: "not_allowed",
    priority: 1,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    restricted_agent_ids: restrictedAgentIds,
    posts: [
      {
        id: `post-${id}`,
        shift: "day",
        specialty_required: "explosives",
        required_agents: 1,
        active: true,
        allowed_gender: "male",
        dog_required: true,
      },
    ],
  };
}

function plan(params: {
  agents: AgentInput[];
  checkpoints: CheckpointInput[];
  exclusions?: { agent_id: string | null; exclusion_type: string }[];
}) {
  return runPlanningEngine({
    sectionId: SECTION_ID,
    agents: params.agents,
    exclusions: params.exclusions ?? [],
    checkpoints: params.checkpoints,
    shift: "day",
    planningDate: PLANNING_DATE,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
}

describe("per-checkpoint cynotechnician restrictions", () => {
  it("never assigns a restricted agent to that checkpoint", () => {
    const agentA = maleHandler("agent-a");
    const agentB = maleHandler("agent-b");
    const cp653 = checkpoint("cp-653", "653", ["agent-a"]);

    expect(isAgentRestrictedFromCheckpoint("agent-a", cp653)).toBe(true);
    expect(isAgentRestrictedFromCheckpoint("agent-b", cp653)).toBe(false);

    const result = plan({ agents: [agentA, agentB], checkpoints: [cp653] });
    expect(result.assignments.some((row) => row.agent_id === "agent-a")).toBe(false);
    expect(result.assignments.some((row) => row.agent_id === "agent-b" && row.checkpoint_id === "cp-653")).toBe(
      true,
    );
  });

  it("still allows the same agent on another unrestricted checkpoint", () => {
    const agentA = maleHandler("agent-a");
    const agentB = maleHandler("agent-b");
    const result = plan({
      agents: [agentA, agentB],
      checkpoints: [
        checkpoint("cp-653", "653", ["agent-a"]),
        checkpoint("cp-753", "753"),
      ],
    });

    expect(result.assignments.some((row) => row.agent_id === "agent-a" && row.checkpoint_id === "cp-653")).toBe(
      false,
    );
    expect(result.assignments.some((row) => row.agent_id === "agent-a" && row.checkpoint_id === "cp-753")).toBe(
      true,
    );
    expect(result.assignments.some((row) => row.agent_id === "agent-b" && row.checkpoint_id === "cp-653")).toBe(
      true,
    );
  });

  it("restores eligibility after the restriction is removed", () => {
    const agentA = maleHandler("agent-a");
    const agentB = maleHandler("agent-b");
    const restricted = plan({
      agents: [agentA, agentB],
      checkpoints: [checkpoint("cp-653", "653", ["agent-a"])],
    });
    expect(restricted.assignments.some((row) => row.agent_id === "agent-a")).toBe(false);

    const cleared = plan({
      agents: [agentA],
      checkpoints: [checkpoint("cp-653", "653", [])],
    });
    expect(cleared.assignments.some((row) => row.agent_id === "agent-a" && row.checkpoint_id === "cp-653")).toBe(
      true,
    );
    expect(isAgentRestrictedFromCheckpoint("agent-a", checkpoint("cp-653", "653", []))).toBe(false);
  });

  it("excludes every restricted agent from that checkpoint", () => {
    const agents = ["agent-a", "agent-b", "agent-c"].map((id) => maleHandler(id));
    const result = plan({
      agents,
      checkpoints: [
        checkpoint("cp-653", "653", ["agent-a", "agent-b"]),
        checkpoint("cp-753", "753"),
      ],
    });

    expect(result.assignments.some((row) => row.agent_id === "agent-a" && row.checkpoint_id === "cp-653")).toBe(
      false,
    );
    expect(result.assignments.some((row) => row.agent_id === "agent-b" && row.checkpoint_id === "cp-653")).toBe(
      false,
    );
    expect(result.assignments.some((row) => row.agent_id === "agent-c" && row.checkpoint_id === "cp-653")).toBe(
      true,
    );
  });

  it("never bypasses the restriction when every eligible agent is banned", () => {
    const agentA = maleHandler("agent-a");
    const agentB = maleHandler("agent-b");
    const cp653 = checkpoint("cp-653", "653", ["agent-a", "agent-b"]);
    const result = plan({ agents: [agentA, agentB], checkpoints: [cp653] });

    expect(result.assignments).toHaveLength(0);
    expect(result.point653.map((row) => row.agent_id).sort()).toEqual(["agent-a", "agent-b"]);

    const { eligible } = qualifyTeams([agentA, agentB], [], "day");
    const reason = classifyUnfilledSlotReason(
      {
        checkpoint_id: "cp-653",
        checkpoint_name: "653",
        post_id: "post-cp-653",
        specialty_required: "explosives",
        required_agents: 1,
        staffed_agents: 0,
        unfilled_count: 1,
        allowed_gender: "male",
        post: cp653.posts[0],
        checkpoint: cp653,
      },
      {
        poolAgents: [agentA, agentB],
        eligible,
        assignedToday: new Set(),
        exclusions: [],
        shift: "day",
        allowNightFallback: false,
        compatibleCheckpointsByAgent: new Map([
          ["agent-a", new Set()],
          ["agent-b", new Set()],
        ]),
        agentVisitedCheckpointsAtStart: new Map(),
      },
    );
    expect(reason).toBe("NO_ELIGIBLE_AGENT");
  });

  it("keeps specialty, exclusion and availability rules after adding restrictions", () => {
    const explosives = maleHandler("explosives-ok");
    const narcotics = maleHandler("narcotics-only", "narcotics");
    const sick = maleHandler("sick-agent");
    const result = plan({
      agents: [explosives, narcotics, sick],
      checkpoints: [checkpoint("cp-753", "753")],
      exclusions: [{ agent_id: "sick-agent", exclusion_type: "sickness" }],
    });

    expect(result.assignments.some((row) => row.agent_id === "explosives-ok")).toBe(true);
    expect(result.assignments.some((row) => row.agent_id === "narcotics-only")).toBe(false);
    expect(result.assignments.some((row) => row.agent_id === "sick-agent")).toBe(false);
    expect(result.excluded.some((row) => row.agent_id === "sick-agent")).toBe(true);
    expect(result.point653.some((row) => row.agent_id === "sick-agent")).toBe(false);
  });
});
