import { describe, expect, it } from "vitest";

import {
  computeDashboardPersonnelStats,
  type DashboardPersonnelAgentInput,
} from "@/lib/dashboard/compute-dashboard-personnel-stats";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";

function agent(
  partial: Partial<DashboardPersonnelAgentInput> & Pick<DashboardPersonnelAgentInput, "id">,
): DashboardPersonnelAgentInput {
  return {
    active: true,
    fonction: "cynotechnicien",
    dog_id: null,
    dogs: null,
    ...partial,
  };
}

function exclusion(
  partial: Partial<AgentExclusionRecord> & Pick<AgentExclusionRecord, "exclusion_type">,
): AgentExclusionRecord {
  return {
    agent_id: partial.agent_id ?? null,
    dog_id: partial.dog_id ?? null,
    exclusion_type: partial.exclusion_type,
    start_date: partial.start_date ?? "2026-08-01",
    end_date: partial.end_date ?? "2026-08-31",
    active: partial.active ?? true,
  };
}

const day = "2026-08-16";

describe("computeDashboardPersonnelStats", () => {
  it("counts all fonctionnaires including administrative staff", () => {
    const stats = computeDashboardPersonnelStats(
      [
        agent({ id: "c1", dog_id: "d1", dogs: { id: "d1", specialty: "narcotics" } }),
        agent({ id: "c2", dog_id: "d2", dogs: { id: "d2", specialty: "explosives" } }),
        agent({ id: "a1", fonction: "secretaire" }),
        agent({ id: "a2", fonction: "chef_de_section" }),
      ],
      [],
      day,
    );

    expect(stats.totalFonctionnaires).toBe(4);
  });

  it("splits cynotechniciens by assigned-dog specialty and ignores administrative staff", () => {
    const stats = computeDashboardPersonnelStats(
      [
        agent({ id: "c1", dog_id: "d1", dogs: { id: "d1", specialty: "narcotics" } }),
        agent({ id: "c2", dog_id: "d2", dogs: { id: "d2", specialty: "narcotics" } }),
        agent({ id: "c3", dog_id: "d3", dogs: { id: "d3", specialty: "currency" } }),
        agent({ id: "c4", dog_id: "d4", dogs: { id: "d4", specialty: "explosives" } }),
        agent({ id: "a1", fonction: "secretaire", dog_id: "d5", dogs: { id: "d5", specialty: "narcotics" } }),
        agent({ id: "c5" }),
      ],
      [],
      day,
    );

    expect(stats.cynotechniciensBySpecialty).toEqual({ narcotics: 3, explosives: 1 });
    expect(stats.cynotechniciensWithoutDog).toBe(1);
  });

  it("counts only active available cynotechniciens as actifs", () => {
    const stats = computeDashboardPersonnelStats(
      [
        agent({ id: "available", dog_id: "d1", dogs: { id: "d1", specialty: "narcotics" } }),
        agent({
          id: "excluded",
          dog_id: "d2",
          dogs: { id: "d2", specialty: "explosives" },
        }),
        agent({
          id: "inactive",
          active: false,
          dog_id: "d3",
          dogs: { id: "d3", specialty: "narcotics" },
        }),
        agent({ id: "admin", fonction: "secretaire" }),
      ],
      [exclusion({ agent_id: "excluded", exclusion_type: "sickness" })],
      day,
    );

    expect(stats.activeCynotechniciens).toBe(1);
    expect(stats.activeCynotechniciensBySpecialty).toEqual({
      narcotics: 1,
      explosives: 0,
    });
  });

  it("does not count administrative personnel as cynotechniciens sans chien", () => {
    const stats = computeDashboardPersonnelStats(
      [
        agent({ id: "c1" }),
        agent({ id: "a1", fonction: "secretaire" }),
        agent({ id: "a2", fonction: "chef_de_section" }),
      ],
      [],
      day,
    );

    expect(stats.cynotechniciensWithoutDog).toBe(1);
  });

  it("counts current exclusions by specialty and ignores expired or inactive exclusion rows", () => {
    const stats = computeDashboardPersonnelStats(
      [
        agent({ id: "narc-agent", dog_id: "dn", dogs: { id: "dn", specialty: "narcotics" } }),
        agent({ id: "expl-agent", dog_id: "de", dogs: { id: "de", specialty: "explosives" } }),
        agent({ id: "expired-agent", dog_id: "dx", dogs: { id: "dx", specialty: "narcotics" } }),
        agent({ id: "flag-off", dog_id: "df", dogs: { id: "df", specialty: "explosives" } }),
        agent({ id: "admin", fonction: "secretaire", dog_id: "da", dogs: { id: "da", specialty: "narcotics" } }),
      ],
      [
        exclusion({ agent_id: "narc-agent", exclusion_type: "mission" }),
        exclusion({
          agent_id: null,
          dog_id: "de",
          exclusion_type: "dog_sick",
        }),
        exclusion({
          agent_id: "expired-agent",
          exclusion_type: "sickness",
          start_date: "2026-07-01",
          end_date: "2026-08-10",
        }),
        exclusion({
          agent_id: "flag-off",
          exclusion_type: "training",
          active: false,
        }),
        exclusion({ agent_id: "admin", exclusion_type: "sickness" }),
      ],
      day,
    );

    expect(stats.excludedCynotechniciensBySpecialty).toEqual({
      narcotics: 1,
      explosives: 1,
    });
    expect(stats.activeCynotechniciens).toBe(2);
    expect(stats.activeCynotechniciensBySpecialty).toEqual({
      narcotics: 1,
      explosives: 1,
    });
  });
});
