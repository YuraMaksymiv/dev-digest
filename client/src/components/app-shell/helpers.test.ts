import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor onboarding", () => {
  it("selects onboarding-tour on the tour route", () => {
    expect(activeKeyFor("/repos/r1/onboarding-tour")).toBe("onboarding-tour");
  });
  it("does not select it on the add-repo /onboarding route", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });
});
