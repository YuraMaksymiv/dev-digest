import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { registerOnboardingNav } from "./nav-extension";

describe("nav-extension", () => {
  const workspaceKeys = () =>
    NAV.find((g) => g.section === "WORKSPACE")!.items.map((i) => i.key);

  it("places onboarding-tour between pulls and context", () => {
    expect(workspaceKeys()).toEqual(["pulls", "onboarding-tour", "context"]);
  });

  it("is idempotent", () => {
    registerOnboardingNav();
    registerOnboardingNav();
    const count = NAV.flatMap((g) => g.items).filter((i) => i.key === "onboarding-tour").length;
    expect(count).toBe(1);
    expect(workspaceKeys()).toEqual(["pulls", "onboarding-tour", "context"]);
  });
});
