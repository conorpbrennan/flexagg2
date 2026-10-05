// useMeta and useDims are the only risk_api reads left: each hits its endpoint once and keeps it
// (the guards and the context bar wait on both).
import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as hooks from "./hooks";
import { useMeta, useDims } from "./hooks";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true, status: 200, json: async () => ({ url }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, W };
}

describe("risk_api hooks", () => {
  it("exports only the reads the explorer uses (no what-if: that lens is not in this app)", () => {
    expect(Object.keys(hooks).sort()).toEqual(["useDims", "useMeta"]);
  });

  it("useMeta reads /api/meta and never goes stale", async () => {
    const { qc, W } = wrapper();
    const { result } = renderHook(() => useMeta(), { wrapper: W });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/meta"]);
    // A just-finished fetch is fresh under any staleTime; pin the option itself.
    expect((qc.getQueryCache().find({ queryKey: ["meta"] })?.options as { staleTime?: number }).staleTime).toBe(Infinity);
  });

  it("useDims reads /api/dims and never goes stale", async () => {
    const { qc, W } = wrapper();
    const { result } = renderHook(() => useDims(), { wrapper: W });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/dims"]);
    expect((qc.getQueryCache().find({ queryKey: ["dims"] })?.options as { staleTime?: number }).staleTime).toBe(Infinity);
  });

  it("a failed read surfaces as an error, not as empty data", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({ detail: "cube building" }),
    });
    const { W } = wrapper();
    const { result } = renderHook(() => useDims(), { wrapper: W });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe("cube building");
  });
});
