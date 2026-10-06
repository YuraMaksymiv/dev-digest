import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { registerOnboardingNav } from "./nav-extension";

describe("nav-extension", () => {
  const workspaceKeys = () =>
    NAV.find((g) => g.section === "WORKSPACE")!.items.map((i) => i.key);

  it("AC-47: places onboarding-tour between pulls and context", () => {
    expect(workspaceKeys()).toEqual(["pulls", "onboarding-tour", "context"]);
  });

  it("AC-47: is idempotent", () => {
    registerOnboardingNav();
    registerOnboardingNav();
    const count = NAV.flatMap((g) => g.items).filter((i) => i.key === "onboarding-tour").length;
    expect(count).toBe(1);
    expect(workspaceKeys()).toEqual(["pulls", "onboarding-tour", "context"]);
  });

  it("AC-47: the item is labelled 'Onboarding Tour' and links to the per-repo tour route", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "onboarding-tour")!;
    expect(item.label).toBe("Onboarding Tour");
    expect(item.href).toBe("/repos/:repoId/onboarding-tour");
  });
});
