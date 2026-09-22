import { describe, it, expect } from "vitest";
import { formatCost, formatTokenCount } from "./format-cost";

describe("formatCost", () => {
  it("renders an em dash for an unknown cost", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("distinguishes a genuine free run from an unknown one", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("widens the decimals as the amount shrinks", () => {
    expect(formatCost(0.0013)).toBe("$0.0013"); // sub-cent: 4dp
    expect(formatCost(0.014)).toBe("$0.014"); // sub-dollar: 3dp
    expect(formatCost(1.239)).toBe("$1.24"); // dollars: 2dp
  });

  it("keeps sub-cent runs from collapsing to $0.00", () => {
    expect(formatCost(0.0001)).toBe("$0.0001");
  });
});

describe("formatTokenCount", () => {
  it("groups thousands", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
    expect(formatTokenCount(812)).toBe("812");
  });
});
