import { describe, expect, it } from "vitest";

import fr from "@/locales/fr.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  bucketPlanningDisplayWarnings,
  compactAlertTrailingParts,
} from "@/lib/planning/planning-warning-presentation";

void i18n.use(initReactI18next).init({
  lng: "fr",
  resources: { fr: { translation: fr } },
});

const t = i18n.t.bind(i18n);

describe("planning-warning-presentation", () => {
  it("hides technical codes for unfilled posts", () => {
    const { critical } = bucketPlanningDisplayWarnings(
      [
        "[NO_ELIGIBLE_AGENT] Checkpoint 17: no eligible agent for explosives — left unfilled.",
      ],
      t,
    );
    expect(critical).toHaveLength(1);
    expect(critical[0].checkpointName).toBe("17");
    expect(critical[0].headline).toBe("Sous-effectif");
    expect(critical[0].detail).not.toContain("NO_ELIGIBLE_AGENT");
    expect(critical[0].specialtyKey).toBe("explosives");
    const parts = compactAlertTrailingParts(critical[0], t);
    expect(parts).toContain("Sous-effectif");
    expect(parts).toContain("Explosifs");
    expect(parts.join(" ")).not.toMatch(/NO_ELIGIBLE/i);
    expect(parts).not.toContain(critical[0].detail);
  });

  it("classifies female reservation as attention", () => {
    const { attention } = bucketPlanningDisplayWarnings(
      [
        "[RESERVED_FOR_FEMALE_ASSIGNMENT] Checkpoint 91: reserved for female explosives assignment (manual PDF insertion).",
      ],
      t,
    );
    expect(attention).toHaveLength(1);
    expect(attention[0].checkpointName).toBe("91");
    expect(attention[0].headline).toBe("Affectation réservée");
    expect(attention[0].detail).not.toContain("RESERVED_FOR_FEMALE");
  });

  it("does not throw when warnings are missing or malformed", () => {
    expect(() => bucketPlanningDisplayWarnings(undefined, t)).not.toThrow();
    expect(() => bucketPlanningDisplayWarnings([], t)).not.toThrow();
    const buckets = bucketPlanningDisplayWarnings([null, 0, "CRITICAL: test"], t);
    expect(buckets.critical.length + buckets.attention.length).toBeGreaterThan(0);
  });
});
