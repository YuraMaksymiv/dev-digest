import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => apiGet(...a), post: (...a: unknown[]) => apiPost(...a) } }));

const status = { data: undefined as unknown, dataUpdatedAt: 0 };
vi.mock("./repo-intel", () => ({ useRepoIntelStatus: () => status }));

import { REINDEX_POLL_LIMIT, useReindexProjectContext } from "./project-context";

const idx = (sha: string, updatedAt = "t0") => ({ lastIndexedSha: sha, updatedAt });

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient();
  Object.assign(status, { data: idx("a"), dataUpdatedAt: 1 });
  apiGet.mockResolvedValue(idx("a"));
  apiPost.mockResolvedValue({ status: "accepted", jobId: "j1" });
});

describe("useReindexProjectContext", () => {
  it("AC-48/49: runs until the index state advances, then refetches the doc list", async () => {
    const onError = vi.fn();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result, rerender } = renderHook(() => useReindexProjectContext("r1", onError), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    expect(apiPost).toHaveBeenCalledWith("/repos/r1/context/reindex");
    expect(result.current.running).toBe(true);

    Object.assign(status, { data: idx("b"), dataUpdatedAt: 2 });
    rerender();
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-context", "docs", "r1"] });
    expect(onError).not.toHaveBeenCalled();
  });

  it("AC-49: a no-op resync that only bumps updated_at counts as finished", async () => {
    const { result, rerender } = renderHook(() => useReindexProjectContext("r1", vi.fn()), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    Object.assign(status, { data: idx("a", "t1"), dataUpdatedAt: 2 });
    rerender();
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it("AC-50: a request failure re-enables Reindex and reports an error", async () => {
    apiPost.mockRejectedValue(new Error("500"));
    const onError = vi.fn();
    const { result } = renderHook(() => useReindexProjectContext("r1", onError), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.running).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("AC-50: a degraded response is an error", async () => {
    apiPost.mockResolvedValue({ status: "accepted", degraded: true, reason: "no_handler" });
    const onError = vi.fn();
    const { result } = renderHook(() => useReindexProjectContext("r1", onError), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.running).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("AC-50: gives up at the poll limit when the state never advances", async () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => useReindexProjectContext("r1", onError), { wrapper });
    await act(async () => {
      await result.current.start();
    });
    for (let i = 0; i < REINDEX_POLL_LIMIT; i++) {
      Object.assign(status, { data: idx("a"), dataUpdatedAt: 2 + i });
      rerender();
    }
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("ignores a second start while one is running", async () => {
    const { result } = renderHook(() => useReindexProjectContext("r1", vi.fn()), { wrapper });
    await act(async () => {
      await result.current.start();
      await result.current.start();
    });
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});
