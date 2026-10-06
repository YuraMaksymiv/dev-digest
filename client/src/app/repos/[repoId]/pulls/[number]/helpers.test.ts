import { describe, it, expect } from "vitest";
import { parseLineParam } from "./helpers";

describe("parseLineParam", () => {
  it("AC-34: accepts positive integers", () => {
    expect(parseLineParam("1")).toBe(1);
    expect(parseLineParam("42")).toBe(42);
  });

  it("AC-34: ignores 0, negatives, decimals, non-numeric, padded and missing values", () => {
    for (const raw of ["0", "-1", "1.5", "x", "", "01", " 3", "3 ", null]) {
      expect(parseLineParam(raw)).toBeNull();
    }
  });
});
