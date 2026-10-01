import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius as BlastRadiusData } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";

const state = vi.hoisted(() => ({
  blast: { data: undefined, isLoading: false, isError: false, refetch: () => {} } as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  },
}));

vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: () => state.blast }));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: undefined }),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

import { BlastRadius } from "./BlastRadius";

afterEach(cleanup);

const DATA: BlastRadiusData = {
  changed_symbols: [{ name: "rateLimit", file: "a.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "router", file: "src/b.ts", line: 23 }],
      endpoints_affected: ["GET /x"],
      crons_affected: ["nightly"],
    },
  ],
  summary: "1 changed symbol reach 1 caller.",
};

function setup(data: unknown, extra: Partial<typeof state.blast> = {}) {
  state.blast = { data, isLoading: false, isError: false, refetch: () => {}, ...extra };
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadius prId="pr1" repoId="r1" repoFullName="o/r" headSha="abc123" />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadius", () => {
  it("renders callers as head-sha GitHub links plus endpoint and cron chips", () => {
    setup(DATA);
    const link = screen.getByRole("link", { name: "src/b.ts:23" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/abc123/src/b.ts#L23");
    expect(screen.getByText("GET /x")).toBeInTheDocument();
    expect(screen.getByText("nightly")).toBeInTheDocument();
  });

  it("shows the empty state when there are no changed symbols", () => {
    setup({ changed_symbols: [], downstream: [], summary: "none" });
    expect(screen.getByText("No downstream impact")).toBeInTheDocument();
  });

  it("shows a degraded notice with the reason hint and still lists callers", () => {
    setup({ ...DATA, degraded: true, reason: "index_partial" });
    expect(screen.getByRole("status")).toHaveTextContent("only partially built");
    expect(screen.getByRole("link", { name: "src/b.ts:23" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resync index/ })).toBeInTheDocument();
  });

  it("tells the user to open the PR once on no_data", () => {
    setup({ changed_symbols: [], downstream: [], summary: "none", degraded: true, reason: "no_data" });
    expect(screen.getByRole("status")).toHaveTextContent("open the PR in DevDigest once");
  });

  it("renders the loading and error states", () => {
    setup(undefined, { isLoading: true });
    expect(screen.queryByText("Blast radius")).not.toBeInTheDocument();
    cleanup();
    setup(undefined, { isError: true });
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
  });
});
