import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>nf</div> }));
vi.mock("@/components/mermaid-diagram", () => ({ MermaidDiagram: () => null }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));

const generateMutate = vi.fn();
const resyncMutate = vi.fn();
const query = {
  data: undefined as OnboardingResponse | undefined,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
};
const generateState = { isPending: false, isError: false };

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: () => query,
  useGenerateOnboarding: () => ({ mutate: generateMutate, ...generateState }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  generateState.isPending = false;
  generateState.isError = false;
  query.isLoading = false;
  query.isError = false;
});

const tour = {
  version: 2 as const,
  architecture: { summary_md: "Uses **Fastify**", diagram: null },
  critical_paths: [{ path: "src/a.ts", reason: "core" }],
  run_steps: [{ command: "pnpm install", note: "deps" }],
  reading_path: [{ path: "src/b.ts", why: "start here", score: 0.91 }],
  first_tasks: [{ title: "Add test", why: "gap", files: ["src/c.ts"] }],
};

function response(over: Partial<OnboardingResponse> = {}): OnboardingResponse {
  return {
    tour,
    source: "llm",
    banner: null,
    index: { status: "full", files_indexed: 10, files_total: 12, last_indexed_sha: "abc" },
    generated_at: new Date().toISOString(),
    generated_sha: "abc",
    stale: false,
    usage: { model: "m1", tokens_in: 100, tokens_out: 50, cost_usd: null, llm_calls: 1, duration_ms: 1 },
    ...over,
  };
}

function ui() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingTourView />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingTourView", () => {
  it("AC-41: shows five skeleton cards and the TOC while loading", () => {
    query.isLoading = true;
    query.data = undefined;
    ui();
    expect(screen.getAllByTestId("tour-skeleton")).toHaveLength(5);
    expect(screen.getByText("ON THIS PAGE")).toBeTruthy();
  });

  it("AC-29, AC-32, AC-39: renders header, cost chip with em dash, open link at sha", () => {
    query.data = response();
    ui();
    expect(screen.getByText("api")).toBeTruthy();
    expect(screen.getByText("m1 · 150 tokens · —")).toBeTruthy();
    const open = screen.getByLabelText("Open src/a.ts on GitHub") as HTMLAnchorElement;
    expect(open.href).toBe("https://github.com/acme/api/blob/abc/src/a.ts");
    expect(open.target).toBe("_blank");
  });

  it("AC-33: copies a run step without executing", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    query.data = response();
    ui();
    fireEvent.click(screen.getByLabelText("Copy command: pnpm install"));
    expect(writeText).toHaveBeenCalledWith("pnpm install");
  });

  it("AC-30: collapses a card locally", () => {
    query.data = response();
    ui();
    expect(screen.getByText("src/b.ts")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Collapse Guided reading path"));
    expect(screen.queryByText("src/b.ts")).toBeNull();
  });

  it("AC-40, AC-45: shows Stale chip and labels skeleton first tasks as unranked", () => {
    query.data = response({ stale: true, source: "skeleton", banner: { kind: "not_generated", reason: null } });
    ui();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText(/Unranked candidates/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Generate" }).length).toBeGreaterThan(0);
  });

  it("AC-36: sends one POST per click burst via ref guard", () => {
    query.data = response();
    ui();
    const btn = screen.getByRole("button", { name: "Regenerate" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-37: disables and relabels while pending, keeping content", () => {
    generateState.isPending = true;
    query.data = response();
    ui();
    const btn = screen.getByRole("button", { name: "Regenerating…" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("src/b.ts")).toBeTruthy();
  });

  it("AC-38: keeps content and shows error banner on POST failure", () => {
    generateState.isError = true;
    query.data = response();
    ui();
    expect(screen.getByRole("alert").textContent).toContain("request failed");
    expect(screen.getByText("src/b.ts")).toBeTruthy();
  });

  it("AC-42: shows empty state whose CTA resyncs on no_clone", () => {
    query.data = response({ tour: null, source: "none", banner: { kind: "no_clone", reason: null } });
    ui();
    fireEvent.click(screen.getByText("Index repository"));
    expect(resyncMutate).toHaveBeenCalled();
  });

  it("AC-43: shows error card with retry when GET fails", () => {
    query.isError = true;
    query.data = undefined;
    ui();
    fireEvent.click(screen.getByText("Retry"));
    expect(query.refetch).toHaveBeenCalled();
  });

  it("AC-29: heading reads 'Onboarding for <repo name>' and the subtitle shows indexed X of Y files and the relative refresh time", () => {
    query.data = response({ generated_at: new Date(Date.now() - 2 * 3_600_000).toISOString() });
    ui();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Onboarding for api");
    const subtitle = screen.getByText(/index of/);
    expect(subtitle.textContent).toMatch(/10 of 12 files/);
    expect(subtitle.textContent).toMatch(/2 hr\. ago|2 hours ago/);
  });

  it("AC-29: a skeleton that was never generated says so instead of a refresh time", () => {
    query.data = response({ source: "skeleton", generated_at: null, banner: { kind: "not_generated", reason: null } });
    ui();
    expect(screen.getByText(/10 of 12 files.*not generated yet/)).toBeTruthy();
  });

  it("AC-31: TOC lists the five sections and each entry scrolls to its anchor", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    query.data = response();
    ui();
    const toc = screen.getByRole("navigation", { name: "ON THIS PAGE" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    links.forEach((link, i) => {
      fireEvent.click(link);
      const target = document.getElementById(link.getAttribute("href")!.slice(1));
      expect(target).not.toBeNull();
      expect(scrollIntoView.mock.instances[i]).toBe(target);
    });
  });

  it("AC-34: Share link copies the current in-app URL and does not execute anything else", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    query.data = response();
    ui();
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();
  });

  it.each([
    ["not_generated", null, /Not generated yet/, "Generate"],
    ["index_degraded", "index_partial", /Index degraded \(index_partial\)/, "Retry"],
    ["llm_failed", null, /Generation failed/, "Retry"],
    ["invalid_output", null, /Model output was invalid/, "Retry"],
  ] as const)("AC-35: banner %s shows its onboarding.json message and a %s button that starts generation", (kind, reason, text, button) => {
    query.data = response({ source: "skeleton", banner: { kind, reason } });
    ui();
    const banner = screen.getByRole("status", { name: "" });
    expect(banner.textContent).toMatch(text);
    fireEvent.click(within(banner).getByRole("button", { name: button }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-35: no banner is rendered when the response has none", () => {
    query.data = response({ banner: null });
    ui();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("AC-36: the click guard is released once the request settles, so a later click sends a new POST", () => {
    generateMutate.mockImplementation((_v: unknown, opts: { onSettled?: () => void }) => opts.onSettled?.());
    query.data = response();
    ui();
    const btn = screen.getByRole("button", { name: "Regenerate" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(generateMutate).toHaveBeenCalledTimes(2);
    generateMutate.mockReset();
  });

  it("AC-36: header button and banner button share one guard (no second POST from the other control)", () => {
    query.data = response({ source: "skeleton", banner: { kind: "llm_failed", reason: null } });
    ui();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-37: the pending banner button is disabled too", () => {
    generateState.isPending = true;
    query.data = response({ source: "skeleton", banner: { kind: "llm_failed", reason: null } });
    ui();
    expect((screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-38: the POST-failure banner offers Retry that sends another POST", () => {
    generateState.isError = true;
    query.data = response();
    ui();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-39: shows model, total tokens and a formatted cost when cost is known", () => {
    query.data = response({ usage: { model: "m1", tokens_in: 1000, tokens_out: 500, cost_usd: 0.0123, llm_calls: 1, duration_ms: 1 } });
    ui();
    const chip = screen.getByText(/^m1 · /);
    expect(chip.textContent).toMatch(/1\.5K|1,500|1500/);
    expect(chip.textContent).not.toContain("—");
    expect(chip.textContent).toMatch(/0\.01/);
  });

  it("AC-39: no usage chip while usage is null", () => {
    query.data = response({ usage: null, source: "skeleton", banner: { kind: "not_generated", reason: null } });
    ui();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it("AC-40: a stale tour shows the chip and never triggers generation by itself", () => {
    query.data = response({ stale: true });
    ui();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("AC-40: no Stale chip for a fresh tour", () => {
    query.data = response({ stale: false });
    ui();
    expect(screen.queryByText("Stale")).toBeNull();
  });

  it("AC-42: the no_clone empty state replaces the cards and does not offer Generate", () => {
    query.data = response({ tour: null, source: "none", banner: { kind: "no_clone", reason: null } });
    ui();
    expect(screen.getByText("Repository not indexed")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Critical paths" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("AC-43: a failed GET shows the error card instead of the sections", () => {
    query.isError = true;
    query.data = undefined;
    ui();
    expect(screen.getByText("Couldn’t load the onboarding tour")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Critical paths" })).toBeNull();
  });

  it("AC-48: header controls are keyboard-focusable buttons with accessible names", () => {
    query.data = response();
    ui();
    for (const name of ["Share link", "Regenerate"]) {
      const btn = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
      btn.focus();
      expect(document.activeElement).toBe(btn);
    }
  });

  it("AC-48: card toggles expose aria-expanded and per-card accessible names from onboarding.json", () => {
    query.data = response();
    ui();
    const toggle = screen.getByRole("button", { name: "Collapse Critical paths" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Expand Critical paths" }).getAttribute("aria-expanded")).toBe("false");
  });
});
