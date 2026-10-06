import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { DiffViewer, type SmartDiffViewerData } from "./DiffViewer";
import type { FocusTarget } from "../helpers";

const scroll = vi.fn();
beforeEach(() => {
  scroll.mockReset();
  Element.prototype.scrollIntoView = scroll;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const patch = (n: number) => `@@ -1,1 +1,${n} @@\n${Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n")}`;
const BIG = 250;
const FILES: PrFile[] = [
  { path: "src/small.ts", additions: 2, deletions: 0, patch: patch(2) },
  { path: "src/big.ts", additions: BIG, deletions: 0, patch: `@@ -1,1 +1,1 @@\n+only big body` },
  {
    path: "src/mixed.ts",
    additions: 1,
    deletions: 1,
    patch: "@@ -5,3 +10,3 @@\n ctx a\n-old b\n+new b\n ctx c",
  },
  {
    path: "src/big-lines.ts",
    additions: BIG,
    deletions: 0,
    patch: "@@ -1,1 +20,2 @@\n+deep one\n+deep two",
  },
  { path: "docs/readme.md", additions: 1, deletions: 0, patch: "@@ -1,1 +7,1 @@\n+doc line" },
  { path: "src/nopatch.ts", additions: 1, deletions: 0, patch: null },
];

const smartDiff = (order: "smart" | "original"): SmartDiffViewerData => ({
  groups: [
    {
      role: "core",
      files: FILES.filter((f) => !f.path.startsWith("docs/")).map((f) => ({
        path: f.path,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        finding_lines: [],
      })),
    },
    { role: "docs", files: [{ path: "docs/readme.md", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  order,
  findingsByFile: new Map(),
  showFindings: true,
});

function ui(focusTarget?: FocusTarget | null, smart?: SmartDiffViewerData) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffViewer files={FILES} focusTarget={focusTarget} smartDiff={smart} />
    </NextIntlClientProvider>
  );
}
const setup = (focusTarget?: FocusTarget | null, smart?: SmartDiffViewerData) =>
  render(ui(focusTarget, smart));

const rowOf = (text: string) => screen.getByText(text).parentElement!;
const target = (file: string, line: number | null): FocusTarget => ({ file, line });

describe("DiffViewer focusTarget (file)", () => {
  it("AC-27: expands a collapsed file, scrolls to it and highlights it", () => {
    setup(target("src/big.ts", null));
    expect(screen.getByText("only big body")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    const card = screen.getByText("src/big.ts").closest("div")!.parentElement!;
    expect(card.style.borderColor).toBe("var(--accent)");
  });

  it("AC-28: an unmatched file renders the diff normally without scrolling", () => {
    setup(target("src/missing.ts", 3));
    expect(screen.getByText("src/small.ts")).toBeInTheDocument();
    expect(screen.queryByText("only big body")).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("AC-28: without focusTarget nothing is expanded or scrolled", () => {
    setup(null);
    expect(screen.queryByText("only big body")).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("DiffViewer focusTarget (line)", () => {
  it("AC-31, AC-32: opens a file over the auto-expand size and centers the target row", () => {
    setup(target("src/big-lines.ts", 21));
    const row = rowOf("deep two");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row.style.outline).toContain("var(--accent)");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(row);
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(rowOf("deep one")).not.toHaveAttribute("aria-current");
  });

  it("AC-31: opens a closed docs group and scrolls to the row", () => {
    setup(target("docs/readme.md", 7), smartDiff("smart"));
    const row = rowOf("doc line");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(row);
  });

  it("AC-31: works in flat original order", () => {
    setup(target("src/mixed.ts", 11), smartDiff("original"));
    expect(rowOf("new b")).toHaveAttribute("aria-current", "true");
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("AC-32: a context line can be the target", () => {
    setup(target("src/mixed.ts", 12));
    expect(rowOf("ctx c")).toHaveAttribute("aria-current", "true");
  });

  it("AC-33: a line absent from the diff falls back to the card without error", () => {
    setup(target("src/mixed.ts", 99));
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    const card = screen.getByText("src/mixed.ts").closest("div")!.parentElement!;
    expect(card.style.borderColor).toBe("var(--accent)");
  });

  it("AC-33: a deleted-only line number does not match a row", () => {
    setup(target("src/mixed.ts", 6));
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("AC-33: a null patch falls back to the card", () => {
    setup(target("src/nopatch.ts", 4));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("AC-35: a changed line re-scrolls; an unchanged re-render does not", () => {
    const { rerender } = setup(target("src/mixed.ts", 10));
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(ui(target("src/mixed.ts", 10)));
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(ui(target("src/mixed.ts", 11)));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.contexts[1]).toBe(rowOf("new b"));
    expect(rowOf("new b")).toHaveAttribute("aria-current", "true");
    expect(rowOf("ctx a")).not.toHaveAttribute("aria-current");
  });

  it("AC-37: reduced motion scrolls without animation", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    setup(target("src/mixed.ts", 11));
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
  });
});
