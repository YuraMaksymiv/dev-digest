import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor onboarding", () => {
  it("AC-47: selects onboarding-tour on the tour route", () => {
    expect(activeKeyFor("/repos/r1/onboarding-tour")).toBe("onboarding-tour");
  });
  it("AC-47: does not select it on the add-repo /onboarding route", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });
  it("AC-47: other workspace routes keep their own active key", () => {
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/onboarding/")).toBe("");
  });
});
