import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

const scroll = vi.fn();
beforeEach(() => {
  scroll.mockReset();
  Element.prototype.scrollIntoView = scroll;
});
afterEach(cleanup);

const patch = (n: number) => `@@ -1,1 +1,${n} @@\n${Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n")}`;
const BIG = 250;
const FILES: PrFile[] = [
  { path: "src/small.ts", additions: 2, deletions: 0, patch: patch(2) },
  { path: "src/big.ts", additions: BIG, deletions: 0, patch: `@@ -1,1 +1,1 @@\n+only big body` },
];

function setup(focusFile?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <DiffViewer files={FILES} focusFile={focusFile} />
    </NextIntlClientProvider>,
  );
}

describe("DiffViewer focusFile", () => {
  it("AC-27: expands a collapsed file, scrolls to it and highlights it", () => {
    setup("src/big.ts");
    expect(screen.getByText("only big body")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
    const card = screen.getByText("src/big.ts").closest("div")!.parentElement!;
    expect(card.style.borderColor).toBe("var(--accent)");
  });

  it("AC-28: an unmatched file renders the diff normally without scrolling", () => {
    setup("src/missing.ts");
    expect(screen.getByText("src/small.ts")).toBeInTheDocument();
    expect(screen.queryByText("only big body")).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("AC-28: without focusFile nothing is expanded or scrolled", () => {
    setup(null);
    expect(screen.queryByText("only big body")).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });
});
