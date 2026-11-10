/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import fr from "@/locales/fr.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DailyPlanningAlertsPanel } from "@/components/planning/daily-planning-alerts-panel";

void i18n.use(initReactI18next).init({
  lng: "fr",
  resources: { fr: { translation: fr } },
});

const t = i18n.t.bind(i18n);

function mountPanel(warnings: unknown) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<DailyPlanningAlertsPanel warnings={warnings as never} t={t} />);
  });
  return () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
}

describe("DailyPlanningAlertsPanel integration", () => {
  it("mounts without error when warnings are undefined or empty", () => {
    expect(() => mountPanel(undefined)()).not.toThrow();
    expect(() => mountPanel([])()).not.toThrow();
  });

  it("renders engine-style warnings without throwing", () => {
    const cleanup = mountPanel([
      "[NO_ELIGIBLE_AGENT] Checkpoint 17: no eligible agent for explosives — left unfilled.",
      "[RESERVED_FOR_FEMALE_ASSIGNMENT] Checkpoint 91: reserved for female explosives assignment (manual PDF insertion).",
      "1 cynotechnicien assigned to Point 653",
    ]);
    expect(document.body.textContent).toContain("Point 17");
    expect(document.body.textContent).toContain("Sous-effectif");
    expect(document.body.textContent).not.toContain("NO_ELIGIBLE_AGENT");
    expect(document.body.textContent).toContain("Point 91");
    expect(document.body.textContent).toContain("Affectation réservée");
    expect(document.body.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    cleanup();
  });

  it("tolerates unexpected warning shapes", () => {
    const cleanup = mountPanel([null, 42, "", "[UNKNOWN_CODE] Checkpoint X: test."]);
    expect(document.body.textContent?.length).toBeGreaterThan(0);
    cleanup();
  });
});
