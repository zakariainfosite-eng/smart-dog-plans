import { describe, expect, it } from "vitest";

import fr from "@/locales/fr.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { translatePlanningReason } from "@/lib/planning-i18n";

void i18n.use(initReactI18next).init({
  lng: "fr",
  resources: { fr: { translation: fr } },
});

const t = i18n.t.bind(i18n);

/**
 * Regression: daily-planning.tsx line ~1154 called translatePlanningReason without importing it
 * (ReferenceError at render when agentExclusions.length > 0).
 */
describe("daily-planning excluded agents render helper", () => {
  it("translatePlanningReason is defined and callable", () => {
    expect(typeof translatePlanningReason).toBe("function");
    expect(translatePlanningReason("Sick", t)).not.toBe("Sick");
  });
});
