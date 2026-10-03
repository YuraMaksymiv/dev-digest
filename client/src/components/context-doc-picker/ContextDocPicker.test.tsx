import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/projectContext.json";

const mutate = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({
    data: [
      { id: "r1", full_name: "acme/one" },
      { id: "r2", full_name: "acme/two" },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r2" }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn() }) }));

const docsFor = vi.fn();
const attachmentsFor = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: (repoId: string) => docsFor(repoId),
  useContextAttachments: (_k: string, _o: string, repoId: string) => attachmentsFor(repoId),
  useContextDocContent: () => ({ data: { path: "specs/a.md", content: "# Hello", tokens: 3 }, isLoading: false, isError: false }),
  useSetContextAttachments: () => ({ mutate, isPending: false }),
}));

import { ContextDocPicker } from "./ContextDocPicker";

const LIMITS = { per_doc_tokens: 4000, total_tokens: 100 };
const d = (path: string, tokens: number) => ({ path, root_type: "specs", size_bytes: 1, tokens, used_by: 0 });

// Stable result objects: the component re-syncs its rows when `data` changes identity.
function ok(data: unknown) {
  const result = { data, isLoading: false, isError: false, refetch: vi.fn() };
  return () => result;
}

beforeEach(() => {
  vi.clearAllMocks();
  docsFor.mockImplementation(
    ok({ docs: [d("specs/a.md", 60), d("specs/b.md", 70)], total_files: 2, total_tokens: 130, truncated: false, reason: null, limits: LIMITS }),
  );
  attachmentsFor.mockImplementation(
    ok({ repo_id: "r2", attachments: [{ path: "specs/b.md", position: 0, status: "ok", tokens: 70 }], limits: LIMITS }),
  );
});
afterEach(cleanup);

function renderPicker() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ContextDocPicker kind="agent" ownerId="a1" title="Project context" hint="hint" />
    </NextIntlClientProvider>,
  );
}

describe("ContextDocPicker", () => {
  it("defaults to the active repo and shows k of n attached with the token footer", () => {
    renderPicker();
    expect(docsFor).toHaveBeenCalledWith("r2");
    expect(screen.getByText("1 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 70 tokens")).toBeInTheDocument();
  });

  it("saves the whole ordered set when a doc is attached", () => {
    renderPicker();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(mutate.mock.calls[0]![0]).toEqual({ ownerId: "a1", repo_id: "r2", paths: ["specs/b.md", "specs/a.md"] });
  });

  it("reorders with the arrow buttons", () => {
    attachmentsFor.mockImplementation(
      ok({
        repo_id: "r2",
        attachments: [
          { path: "specs/a.md", position: 0, status: "ok", tokens: 60 },
          { path: "specs/b.md", position: 1, status: "ok", tokens: 70 },
        ],
        limits: { per_doc_tokens: 4000, total_tokens: 10000 },
      }),
    );
    renderPicker();
    fireEvent.click(screen.getByLabelText("Move a.md down"));
    expect(mutate.mock.calls[0]![0].paths).toEqual(["specs/b.md", "specs/a.md"]);
  });

  it("flags a missing attachment", () => {
    attachmentsFor.mockImplementation(
      ok({ repo_id: "r2", attachments: [{ path: "specs/gone.md", position: 0, status: "missing", tokens: 0 }], limits: LIMITS }),
    );
    renderPicker();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("warns when the attached docs exceed the total cap", () => {
    attachmentsFor.mockImplementation(
      ok({
        repo_id: "r2",
        attachments: [
          { path: "specs/a.md", position: 0, status: "ok", tokens: 60 },
          { path: "specs/b.md", position: 1, status: "ok", tokens: 70 },
        ],
        limits: LIMITS,
      }),
    );
    renderPicker();
    expect(screen.getByRole("status")).toHaveTextContent("130 tokens, over the 100 token cap");
  });

  it("reverts and offers a retry when saving fails", () => {
    mutate.mockImplementation((_input, opts) => opts.onError());
    renderPicker();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(toastError).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")[1]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByText("Retry"));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("opens a markdown preview", () => {
    renderPicker();
    fireEvent.click(screen.getByLabelText("Preview a.md"));
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });
});
