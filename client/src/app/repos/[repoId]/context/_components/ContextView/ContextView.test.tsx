import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/projectContext.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo not found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));

const list = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
const content = { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() };
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn() }) }));
const reindex = { start: vi.fn(), running: false };
let reindexOnError: () => void = () => {};
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: () => list,
  useContextDocContent: () => content,
  useReindexProjectContext: (_repoId: string, onError: () => void) => {
    reindexOnError = onError;
    return reindex;
  },
}));
const { saveMarkdown } = vi.hoisted(() => ({ saveMarkdown: vi.fn() }));
vi.mock("../../helpers", async (orig) => ({ ...(await orig<typeof import("../../helpers")>()), saveMarkdown }));

import { ContextView } from "./ContextView";

const doc = (path: string, used_by = 0) => ({ path, root_type: "specs", size_bytes: 1, tokens: 10, used_by });
const LIMITS = { per_doc_tokens: 4000, total_tokens: 10000 };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(list, {
    data: { docs: [doc("specs/a.md", 3), doc("specs/b.md", 1)], total_files: 2, total_tokens: 20, truncated: false, reason: null, limits: LIMITS },
    isLoading: false,
    isError: false,
  });
  Object.assign(content, { data: { path: "specs/a.md", content: "# Title", tokens: 5 }, isLoading: false, isError: false });
  Object.assign(reindex, { running: false });
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>
      <ContextView />
    </NextIntlClientProvider>,
  );
}

describe("ContextView", () => {
  it("lists docs, previews the first and shows used-by and the index footer", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("Indexed: 2 files · 20 tokens total")).toBeInTheDocument();
  });

  it("switches the selection and filters by search", () => {
    renderView();
    fireEvent.click(screen.getByText("b.md"));
    expect(screen.getByText("Used by 1 agent")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match “zzz”.")).toBeInTheDocument();
  });

  it("AC-31: offers no enabled edit, new or upload control", () => {
    renderView();
    expect(screen.queryByText(/upload|new/i)).toBeNull();
    const edit = screen.getByRole("tab", { name: "Edit" });
    expect(edit).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(edit);
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  });

  it("AC-53: the Edit tab is disabled with the repo tooltip", () => {
    renderView();
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("title", "Docs are edited in the repo");
  });

  it("AC-48: Reindex starts a reindex and shows busy + disabled while running", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Reindex" }));
    expect(reindex.start).toHaveBeenCalledTimes(1);
    cleanup();
    Object.assign(reindex, { running: true });
    renderView();
    const btn = screen.getByRole("button", { name: "Reindex" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("AC-50: a reindex failure raises an error toast and keeps the list", () => {
    renderView();
    reindexOnError();
    expect(toastError).toHaveBeenCalledWith("Couldn’t reindex the repository. The current list is unchanged.");
    expect(screen.getByText("b.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reindex" })).toBeEnabled();
  });

  it("AC-51: Download saves the fetched content as <basename>.md", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(saveMarkdown).toHaveBeenCalledWith("a.md", "# Title");
  });

  it.each([
    ["loading", { data: undefined, isLoading: true, isError: false }],
    ["failed", { data: undefined, isLoading: false, isError: true }],
  ])("AC-52: Download is disabled while content is %s", (_n, patch) => {
    Object.assign(content, patch);
    renderView();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("AC-52: Download is disabled when no doc is selected", () => {
    Object.assign(list, { data: { docs: [], total_files: 0, total_tokens: 0, truncated: false, reason: null, limits: LIMITS } });
    Object.assign(content, { data: undefined });
    renderView();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("does not render raw HTML from a document", () => {
    Object.assign(content, { data: { path: "specs/a.md", content: "<script>window.x=1</script><b id=\"raw\">hi</b>", tokens: 5 } });
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("#raw")).toBeNull();
  });

  it("shows the not-cloned, empty and error states", () => {
    Object.assign(list, { data: { docs: [], total_files: 0, total_tokens: 0, truncated: false, reason: "not_cloned", limits: LIMITS } });
    const first = renderView();
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
    first.unmount();

    Object.assign(list, { data: { docs: [], total_files: 0, total_tokens: 0, truncated: false, reason: null, limits: LIMITS } });
    const second = renderView();
    expect(screen.getByText("No project documents yet")).toBeInTheDocument();
    second.unmount();

    Object.assign(list, { data: undefined, isError: true });
    renderView();
    expect(screen.getByText("Couldn’t load project documents")).toBeInTheDocument();
  });

  it("notes truncation", () => {
    Object.assign(list, { data: { ...(list.data as object), total_files: 600, truncated: true } });
    renderView();
    expect(screen.getByText("Showing the first 2 of 600 files.")).toBeInTheDocument();
  });
});
