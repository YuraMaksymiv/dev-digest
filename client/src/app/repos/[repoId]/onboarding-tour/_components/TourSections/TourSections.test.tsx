import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { TourSections } from "./TourSections";

afterEach(cleanup);

type Tour = NonNullable<OnboardingResponse["tour"]>;

const baseTour: Tour = {
  version: 2,
  architecture: { summary_md: "Layered **service**", diagram: null },
  critical_paths: [{ path: "src/charge.ts", reason: "Every payment flows here" }],
  run_steps: [
    { command: "pnpm install", note: "Install deps" },
    { command: "pnpm run dev", note: "Start the API" },
  ],
  reading_path: [
    { path: "src/charge.ts", why: "Core logic", score: 1.5 },
    { path: "src/refund.ts", why: "Refund flow", score: 0.4321 },
    { path: "src/util.ts", why: "Helpers", score: 0.1 },
  ],
  first_tasks: [{ title: "Cover refund", why: "no sibling test", files: ["src/refund.ts"] }],
};

function ui(over: { tour?: Tour | null; source?: OnboardingResponse["source"]; sha?: string | null } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourSections
        tour={over.tour === undefined ? baseTour : over.tour}
        source={over.source ?? "llm"}
        fullName="acme/payments-api"
        sha={over.sha === undefined ? "deadbeef" : over.sha}
      />
    </NextIntlClientProvider>,
  );
}

describe("TourSections", () => {
  it("AC-28, NFR-5: renders summary_md, why, reason and note as Markdown without raw HTML", () => {
    const { container } = ui({
      tour: {
        ...baseTour,
        architecture: { summary_md: 'Hello **bold** <script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">', diagram: null },
        critical_paths: [{ path: "src/charge.ts", reason: "reason <b>raw</b> and `code`" }],
        run_steps: [{ command: "pnpm install", note: "note <iframe src='//evil'></iframe>" }],
        reading_path: [{ path: "src/charge.ts", why: "why <style>*{display:none}</style>", score: 1 }],
      },
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("AC-30: shows the five cards in order, all expanded on load", () => {
    ui();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    for (const title of ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"]) {
      expect(screen.getByRole("button", { name: `Collapse ${title}` }).getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("AC-30: each card collapses and re-expands independently with local state", () => {
    ui();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Critical paths" }));
    expect(screen.queryByText("Every payment flows here")).toBeNull();
    expect(screen.getByText("Core logic")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand Critical paths" }));
    expect(screen.getByText("Every payment flows here")).toBeTruthy();
  });

  it("AC-31: section anchors exist for every TOC target", () => {
    const { container } = ui();
    for (const id of ["architecture", "critical-paths", "run-locally", "reading-path", "first-tasks"]) {
      expect(container.querySelector(`#onboarding-${id}`)).not.toBeNull();
    }
  });

  it("AC-32: Open on a path row links to the GitHub blob at last_indexed_sha in a new tab", () => {
    ui();
    for (const path of ["src/charge.ts", "src/refund.ts"]) {
      const link = screen.getAllByLabelText(`Open ${path} on GitHub`)[0] as HTMLAnchorElement;
      expect(link.href).toBe(`https://github.com/acme/payments-api/blob/deadbeef/${path}`);
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
    }
  });

  it("AC-32: no Open link is rendered when the indexed sha is unknown", () => {
    ui({ sha: null });
    expect(screen.queryByLabelText(/^Open .* on GitHub$/)).toBeNull();
  });

  it("AC-33: each run-step copy button copies exactly its command and nothing else", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    ui();
    fireEvent.click(screen.getByLabelText("Copy command: pnpm run dev"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("pnpm run dev");
    expect(within(screen.getByLabelText("Copy command: pnpm run dev")).getByText("Copied")).toBeTruthy();
  });

  it("AC-44: the reading path shows path, why and score badge per row, numbered in order", () => {
    ui();
    const section = screen.getByRole("region", { name: "Guided reading path" });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(section.querySelector("ol")).not.toBeNull();
    const expected = [
      ["1", "src/charge.ts", "Core logic", "1.50"],
      ["2", "src/refund.ts", "Refund flow", "0.43"],
      ["3", "src/util.ts", "Helpers", "0.10"],
    ];
    rows.forEach((row, i) => {
      for (const text of expected[i]!) expect(within(row).getByText(text)).toBeTruthy();
    });
    expect(within(rows[1]!).getByLabelText("Score 0.43")).toBeTruthy();
  });

  it("AC-45: skeleton first tasks are labelled as unranked candidates", () => {
    ui({ source: "skeleton" });
    const section = screen.getByRole("region", { name: "First tasks" });
    expect(within(section).getByText(/Unranked candidates/)).toBeTruthy();
    expect(within(section).getByText("Cover refund")).toBeTruthy();
  });

  it("AC-45: a generated (llm) tour does not carry the unranked label", () => {
    ui({ source: "llm" });
    expect(screen.queryByText(/Unranked candidates/)).toBeNull();
  });

  it("AC-46: a diagram that fails to render is omitted and summary_md is still shown", async () => {
    ui({ tour: { ...baseTour, architecture: { summary_md: "Summary survives", diagram: "this is not mermaid at all" } } });
    expect(screen.getByText("Summary survives")).toBeTruthy();
    await waitFor(() => {
      const box = screen.getByRole("img", { name: "Architecture diagram" });
      expect(box.childElementCount).toBe(0);
    });
  });

  it("AC-46: syntactically mermaid-looking but unparseable diagram never breaks the card", async () => {
    ui({ tour: { ...baseTour, architecture: { summary_md: "Still here", diagram: "flowchart LR\n A[[[ --> -->" } } });
    await waitFor(() => expect(screen.getByText("Still here")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/Syntax error/i);
  });

  it("AC-48: all copy on the page comes from onboarding.json", () => {
    ui();
    for (const key of ["architecture", "criticalPaths", "runLocally", "readingPath", "firstTasks"] as const) {
      expect(screen.getByRole("region", { name: messages.sections[key] })).toBeTruthy();
    }
    expect(screen.getAllByText(messages.actions.open).length).toBeGreaterThan(0);
    expect(screen.getAllByText(messages.actions.copy).length).toBe(2);
  });
});
