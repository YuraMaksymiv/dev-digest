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
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: () => list,
  useContextDocContent: () => content,
}));

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

  it("offers no edit, new or upload controls", () => {
    renderView();
    expect(screen.queryByText(/edit|upload|new/i)).toBeNull();
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
