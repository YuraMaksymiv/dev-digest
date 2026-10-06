import { describe, it, expect } from "vitest";
import { downloadName } from "./helpers";

describe("downloadName", () => {
  it("keeps only the basename with a .md extension", () => {
    expect(downloadName("docs/guide/ARCH.md")).toBe("ARCH.md");
    expect(downloadName("specs/a.MD")).toBe("a.md");
  });
  it("replaces characters unsafe in filenames", () => {
    expect(downloadName('docs/we:ird*"name.md')).toBe("we_ird__name.md");
  });
});
