import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const replace = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));

const extractMutate = vi.fn();
const query = {
  data: [] as ConventionCandidate[],
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
};

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => query,
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false, isError: false }),
  usePatchConvention: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteConvention: () => ({ mutate: vi.fn(), isPending: false }),
  useConventionSkillDraft: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(cleanup);

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    category: "async",
    rule: "Always use async/await instead of .then() chains",
    rationale: null,
    evidence_path: "src/api/users.ts",
    evidence_line: 23,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "pending",
    created_at: "2026-09-21T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.delete("status");
  Object.assign(query, { data: [], isLoading: false, isError: false, error: undefined });
});

describe("ConventionsView", () => {
  it("offers the scan and no triage toolbar before anything has been scanned", () => {
    renderWithIntl();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("shows the error state instead of an empty one when the list fails to load", () => {
    Object.assign(query, { isError: true });
    renderWithIntl();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  it("bills ONE scan for a burst of clicks on the two scan controls", () => {
    renderWithIntl();
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("gates Create skill until something is accepted", () => {
    Object.assign(query, { data: [candidate()] });
    renderWithIntl();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    cleanup();
    Object.assign(query, { data: [candidate({ status: "accepted" })] });
    renderWithIntl();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("distinguishes 'nothing scanned' from 'nothing in this filter'", () => {
    Object.assign(query, { data: [candidate({ status: "rejected" })] });
    searchParams.set("status", "accepted");
    renderWithIntl();
    expect(screen.getByText("Nothing in this filter")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  it("puts the chosen filter in the URL so a reload keeps it", () => {
    Object.assign(query, { data: [candidate()] });
    renderWithIntl();
    fireEvent.click(screen.getByText("Accepted"));
    expect(replace).toHaveBeenCalledWith("/repos/r1/conventions?status=accepted");
  });
});
