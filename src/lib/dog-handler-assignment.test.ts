import { describe, expect, it } from "vitest";

import {
  collectDogsWithoutHandler,
  isDogWithoutHandler,
  resolveDogHandlerAgentId,
} from "@/lib/dog-handler-assignment";

describe("dog-handler-assignment", () => {
  const agents = [
    { id: "a1", dog_id: "d1" },
    { id: "a2", dog_id: null },
  ];

  it("detects handler via agents.dog_id", () => {
    expect(resolveDogHandlerAgentId({ id: "d1", agent: null }, agents)).toBe("a1");
    expect(isDogWithoutHandler({ id: "d1", active: true, agent: null }, agents)).toBe(false);
  });

  it("counts dog without handler", () => {
    expect(isDogWithoutHandler({ id: "d2", active: true, agent: null }, agents)).toBe(true);
    expect(collectDogsWithoutHandler([{ id: "d2", active: true, agent: null }], agents)).toHaveLength(1);
  });

  it("ignores inactive dogs", () => {
    expect(isDogWithoutHandler({ id: "d3", active: false, agent: null }, agents)).toBe(false);
  });

  it("prefers nested agent relation when present", () => {
    expect(
      resolveDogHandlerAgentId(
        { id: "d9", agent: { id: "a9", first_name: "X", last_name: "Y" } as never },
        agents,
      ),
    ).toBe("a9");
  });
});
