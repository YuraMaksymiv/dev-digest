import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";

const push = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  brief: { data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  },
  gen: { mutateAsync: vi.fn(), isPending: false, isError: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ repoId: "r1", number: "7" }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => state.brief,
  useGenerateBrief: () => state.gen,
}));

import { PrBrief } from "./PrBrief";

const BRIEF: PrBriefResponse = {
  summary: "Adds rate limiting <b>to</b> the API.",
  risks: [
    {
      kind: "security",
      title: "Bypass risk",
      explanation: "Header may be spoofed.",
      severity: "high",
      file_refs: ["src/a.ts"],
    },
  ],
  review_focus: [
    { file: "src/a.ts", line: 12, reason: "Core check" },
    { file: "src/b file.ts", line: null, reason: "Wiring" },
  ],
  head_sha: "abc",
  generated_at: "2026-10-04T00:00:00Z",
  model: "m",
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: 0.0123,
  missing_inputs: ["linked_issue"],
  stale: false,
};

function setup(data: unknown, brief: Partial<typeof state.brief> = {}) {
  state.brief = { data, isLoading: false, isError: false, refetch: vi.fn(), ...brief };
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBrief prId="pr1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  state.gen = { mutateAsync: vi.fn().mockResolvedValue(BRIEF), isPending: false, isError: false };
});
afterEach(cleanup);

describe("PrBrief", () => {
  it("AC-21: shows a Generate call to action when no brief exists", () => {
    setup(null);
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
  });

  it("AC-22: a double click on Generate sends one request", async () => {
    let resolve!: (v: unknown) => void;
    state.gen.mutateAsync = vi.fn(() => new Promise((r) => (resolve = r)));
    setup(null);
    const btn = screen.getByRole("button", { name: "Generate brief" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(state.gen.mutateAsync).toHaveBeenCalledTimes(1);
    resolve(BRIEF);
    await waitFor(() => expect(state.gen.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("AC-22: shows a skeleton while generating", () => {
    state.gen.isPending = true;
    const { container } = setup(null);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText("No brief yet")).toBeNull();
  });

  it("AC-23: shows an error with retry when generation fails and keeps the cached brief", () => {
    state.gen.isError = true;
    setup(BRIEF);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't generate the brief");
    expect(screen.getByText("Bypass risk")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.gen.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("AC-25: renders summary, severity-labelled risks, focus items, cost chip and missing inputs", () => {
    setup(BRIEF);
    expect(screen.getByText("Adds rate limiting <b>to</b> the API.")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Header may be spoofed.")).toBeInTheDocument();
    expect(screen.getByText("Cost $0.012")).toBeInTheDocument();
    expect(screen.getByText("Linked issue unavailable")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
  });

  it("AC-24: shows a stale notice and Refresh regenerates", () => {
    setup({ ...BRIEF, stale: true });
    expect(screen.getByRole("status")).toHaveTextContent("earlier commit");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(state.gen.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("AC-26: clicking a focus item navigates to the diff tab with the file", () => {
    setup(BRIEF);
    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts at line 12 in the diff" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fa.ts");
    fireEvent.click(screen.getByRole("button", { name: "Open src/b file.ts in the diff" }));
    expect(push).toHaveBeenLastCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fb%20file.ts");
  });

  it("AC-12, AC-25: shows empty states for no risks and no focus", () => {
    setup({ ...BRIEF, risks: [], review_focus: [], missing_inputs: [] });
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("No specific review focus suggested.")).toBeInTheDocument();
  });

  it("AC-29, AC-30: risk file refs are not clickable and focus items are labelled buttons", () => {
    setup(BRIEF);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter(Boolean)).toHaveLength(2);
    expect(screen.getByText("src/a.ts").closest("button")).toBeNull();
    expect(screen.getByText("src/a.ts").closest("a")).toBeNull();
  });

  it("AC-19: model text is rendered as plain text, not markup", () => {
    const { container } = setup(BRIEF);
    expect(container.querySelector("b")).toBeNull();
  });
});
