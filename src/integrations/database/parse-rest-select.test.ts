import { describe, expect, it } from "vitest";
import { parseLocalRestSelect } from "@/integrations/database/local-rest-engine";

const HISTORY_DETAIL_EMBED_SELECT = `id, planning_id, checkpoint_post_id, agent_id, dog_id, is_hq_reserve, is_off_duty,
       agents:agent_id(id, first_name, last_name, professional_number, grade, gender),
       dogs:dog_id(id, name, specialty),
       checkpoint_posts:checkpoint_post_id(
         id, specialty_required, required_agents, shift, checkpoint_id,
         checkpoints:checkpoint_id(id, name, night_only)
       )`;

describe("parseLocalRestSelect nested embeds", () => {
  it("parses the historical planning assignment select even when it spans multiple lines", () => {
    const parsed = parseLocalRestSelect(HISTORY_DETAIL_EMBED_SELECT, "planning_assignments");
    expect(parsed.columns).toEqual(
      expect.arrayContaining([
        "id",
        "planning_id",
        "checkpoint_post_id",
        "agent_id",
        "dog_id",
        "is_hq_reserve",
        "is_off_duty",
      ]),
    );
    expect(parsed.embeds.map((embed) => embed.alias)).toEqual([
      "agents",
      "dogs",
      "checkpoint_posts",
    ]);
    expect(parsed.embeds.map((embed) => embed.relatedTable)).toEqual([
      "agents",
      "dogs",
      "checkpoint_posts",
    ]);
    const posts = parsed.embeds.find((embed) => embed.alias === "checkpoint_posts");
    expect(posts?.embeds.map((embed) => embed.alias)).toEqual(["checkpoints"]);
  });

  it("still parses a single-line embed used by the history list path", () => {
    const parsed = parseLocalRestSelect(
      "id, planning_date, shift, validated, created_at, section_id",
      "planning",
    );
    expect(parsed.embeds).toEqual([]);
    expect(parsed.columns).toContain("id");
    expect(parsed.columns).toContain("section_id");
  });
});
