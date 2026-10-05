// AppProvider URL sync: runs on every lens path (LENS_PATHS), never on "/" or unknown paths
// (that would undo the <Navigate> redirect), and follows context changes made after mount.
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { AppProvider, useApp } from "./AppContext";
import { LENS_PATHS } from "../routes/paths";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    const body = { dates: ["2026-01-01", "2026-01-02"], scenario_sets: ["HistFull", "HistShort"],
      managers: [{ manager: "Millennium" }, { manager: "Citadel" }], factors: [], ts_measures: [], by_levels: [] };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
});

let ctx: ReturnType<typeof useApp>;
function Probe() {
  ctx = useApp();
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><AppProvider><Probe /></AppProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId("loc").textContent!;
const query = () => new URLSearchParams(loc().split("?")[1] ?? "");

describe("AppProvider URL sync", () => {
  it.each([...LENS_PATHS])("syncs the context into the URL on lens path %s", async (path) => {
    renderAt(path);
    await vi.waitFor(() => expect(query().get("date")).toBe("2026-01-02"));
    expect(loc().startsWith(path + "?")).toBe(true);
    expect(query().get("manager")).toBe("Millennium");
    expect(query().get("set")).toBe("HistFull");
  });

  it.each(["/", "/nope"])("leaves the URL alone on non-lens path %s", async (path) => {
    renderAt(path);
    await vi.waitFor(() => expect(ctx.ready).toBe(true));
    expect(loc()).toBe(path);
  });

  it("updates the URL params when manager, date or scenario change after mount", async () => {
    renderAt(LENS_PATHS[0]);
    await vi.waitFor(() => expect(ctx.ready).toBe(true));
    act(() => { ctx.setManager("Citadel"); ctx.setDate("2026-01-01"); ctx.setScenario("HistShort"); });
    await vi.waitFor(() => expect(query().get("manager")).toBe("Citadel"));
    expect(query().get("date")).toBe("2026-01-01");
    expect(query().get("set")).toBe("HistShort");
  });
});
