// Routing shell: the pivot lens renders at /pivot; the left rail marks the active lens.
// Redirects: "/", unknown paths and extra segments land on /pivot, keeping the context params.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("./routes/Pivot", () => ({ Pivot: () => <main data-testid="pivot-route">pivot lens</main> }));

import App from "./App";
import { LENS_PATHS } from "./routes/paths";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    const body = { dates: [], scenario_sets: [], managers: [], factors: [], ts_measures: [], by_levels: [] };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
});

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><App /><Probe /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App shell", () => {
  it("shows the context bar and a left rail whose Pivot link is the active one", async () => {
    renderAt("/pivot");
    await screen.findByTestId("pivot-route");
    expect(screen.getByText("Factor risk")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Pivot" });
    expect(link.getAttribute("href")).toBe("/pivot");
    expect(link.className).toBe("active");
  });

  it.each(["/", "/nope", "/pivot/extra/x"])("redirects %s to /pivot and renders the pivot lens", async (path) => {
    renderAt(path);
    await screen.findByTestId("pivot-route");
    expect(screen.getByTestId("loc").textContent!.startsWith("/pivot?")).toBe(true);
  });

  it("keeps the context query params through the redirect from /", async () => {
    renderAt("/?manager=Citadel&date=2026-01-02&set=HistShort");
    await screen.findByTestId("pivot-route");
    const loc = screen.getByTestId("loc").textContent!;
    expect(loc.startsWith("/pivot?")).toBe(true);
    const q = new URLSearchParams(loc.split("?")[1]);
    expect(q.get("manager")).toBe("Citadel");
    expect(q.get("date")).toBe("2026-01-02");
    expect(q.get("set")).toBe("HistShort");
  });

  it.each([...LENS_PATHS])("renders the lens route and syncs context params at %s (no redirect)", async (path) => {
    renderAt(path);
    await screen.findByTestId("pivot-route");
    await vi.waitFor(() => expect(screen.getByTestId("loc").textContent).toMatch(/\?.*manager=/));
    expect(screen.getByTestId("loc").textContent!.startsWith(path + "?")).toBe(true);
  });
});
