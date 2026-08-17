import { describe, expect, it } from "vitest";
import {
  CLEAR_DOG_ASSIGNMENT_DATE_SQL,
  UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL,
  applyUnassignIfWithoutHandlerExclusionSync,
  dogIdToUnassignForWithoutHandlerExclusion,
} from "./unassign-dog-handler";

function activeWithoutHandler(overrides: Record<string, unknown> = {}) {
  return {
    exclusion_type: "dog_without_handler",
    active: true,
    dog_id: "dog-1",
    ...overrides,
  };
}

describe("dogIdToUnassignForWithoutHandlerExclusion", () => {
  it("returns the dog id for an active Chien sans maître exclusion", () => {
    expect(dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler())).toBe("dog-1");
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler({ active: 1 })),
    ).toBe("dog-1");
  });

  it("does not unassign when the dog already has no handler on the exclusion row", () => {
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler({ dog_id: null })),
    ).toBeNull();
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler({ dog_id: "" })),
    ).toBeNull();
  });

  it("does not unassign inactive or other exclusion types", () => {
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler({ active: false })),
    ).toBeNull();
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(activeWithoutHandler({ active: 0 })),
    ).toBeNull();
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(
        activeWithoutHandler({ exclusion_type: "dog_sick" }),
      ),
    ).toBeNull();
    expect(
      dogIdToUnassignForWithoutHandlerExclusion(
        activeWithoutHandler({ exclusion_type: "dog_vet_visit" }),
      ),
    ).toBeNull();
  });
});

describe("applyUnassignIfWithoutHandlerExclusionSync", () => {
  it("clears agents.dog_id when a handler assignment exists", () => {
    const assignedDogs = new Set(["dog-1"]);
    const sql: string[] = [];
    const unassigned = applyUnassignIfWithoutHandlerExclusionSync(activeWithoutHandler(), (statement, params) => {
      sql.push(statement);
      if (statement === UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL) {
        const dogId = String(params[0]);
        if (assignedDogs.has(dogId)) {
          assignedDogs.delete(dogId);
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      return { changes: 0 };
    });

    expect(unassigned).toBe(true);
    expect(assignedDogs.has("dog-1")).toBe(false);
    expect(sql[0]).toBe(UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL);
    expect(sql[1]).toBe(CLEAR_DOG_ASSIGNMENT_DATE_SQL);
  });

  it("saves successfully without assignment SQL when the dog is already unassigned", () => {
    const sql: string[] = [];
    const unassigned = applyUnassignIfWithoutHandlerExclusionSync(activeWithoutHandler(), (statement, params) => {
      sql.push(statement);
      if (statement === UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL) {
        expect(params[0]).toBe("dog-1");
        return { changes: 0 };
      }
      throw new Error(`unexpected SQL: ${statement}`);
    });

    expect(unassigned).toBe(false);
    expect(sql).toEqual([UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL]);
  });

  it("does not touch assignments for other exclusion types", () => {
    const unassigned = applyUnassignIfWithoutHandlerExclusionSync(
      activeWithoutHandler({ exclusion_type: "dog_sick" }),
      () => {
        throw new Error("must not run assignment SQL");
      },
    );
    expect(unassigned).toBe(false);
  });
});
