import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  it("shows five skeleton cards while loading (AC-41)", () => {
    query.isLoading = true;
    query.data = undefined;
    ui();
    expect(screen.getAllByTestId("tour-skeleton")).toHaveLength(5);
    expect(screen.getByText("ON THIS PAGE")).toBeTruthy();
  });

  it("renders header, cost chip with em dash, open link at sha (AC-29/32/39)", () => {
    query.data = response();
    ui();
    expect(screen.getByText("api")).toBeTruthy();
    expect(screen.getByText("m1 · 150 tokens · —")).toBeTruthy();
    const open = screen.getByLabelText("Open src/a.ts on GitHub") as HTMLAnchorElement;
    expect(open.href).toBe("https://github.com/acme/api/blob/abc/src/a.ts");
    expect(open.target).toBe("_blank");
  });

  it("copies a run step without executing (AC-33)", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    query.data = response();
    ui();
    fireEvent.click(screen.getByLabelText("Copy command: pnpm install"));
    expect(writeText).toHaveBeenCalledWith("pnpm install");
  });

  it("collapses a card locally (AC-30)", () => {
    query.data = response();
    ui();
    expect(screen.getByText("src/b.ts")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Collapse Guided reading path"));
    expect(screen.queryByText("src/b.ts")).toBeNull();
  });

  it("shows Stale chip and labels skeleton first tasks as unranked (AC-40/45)", () => {
    query.data = response({ stale: true, source: "skeleton", banner: { kind: "not_generated", reason: null } });
    ui();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText(/Unranked candidates/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Generate" }).length).toBeGreaterThan(0);
  });

  it("sends one POST per click burst via ref guard (AC-36)", () => {
    query.data = response();
    ui();
    const btn = screen.getByRole("button", { name: "Regenerate" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("disables and relabels while pending, keeping content (AC-37)", () => {
    generateState.isPending = true;
    query.data = response();
    ui();
    const btn = screen.getByRole("button", { name: "Regenerating…" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("src/b.ts")).toBeTruthy();
  });

  it("keeps content and shows error banner on POST failure (AC-38)", () => {
    generateState.isError = true;
    query.data = response();
    ui();
    expect(screen.getByRole("alert").textContent).toContain("request failed");
    expect(screen.getByText("src/b.ts")).toBeTruthy();
  });

  it("shows empty state whose CTA resyncs on no_clone (AC-42)", () => {
    query.data = response({ tour: null, source: "none", banner: { kind: "no_clone", reason: null } });
    ui();
    fireEvent.click(screen.getByText("Index repository"));
    expect(resyncMutate).toHaveBeenCalled();
  });

  it("shows error card with retry when GET fails (AC-43)", () => {
    query.isError = true;
    query.data = undefined;
    ui();
    fireEvent.click(screen.getByText("Retry"));
    expect(query.refetch).toHaveBeenCalled();
  });
});
