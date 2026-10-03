// Multi-manager Phase 3/4: with >1 manager loaded, the three manager-independent attribution measures
// (Factor contribution / Specific PnL / Realized PnL — baked columns with no Manager key, risk_api.py's
// _validate_pivot) must be refused. The refusal now happens in the browser (src/ap/guards.ts) BEFORE any
// MDX is sent. This proves the Pivot lens surfaces that message (not a generic "request failed") and that
// the rejected query reaches ActivePivot not at all — driven end-to-end through a saved view, with the
// real pivotSource and cellset adapter over a stubbed ActivePivot.
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("ag-grid-react", () => ({
  AgGridReact: ({ rowData, columnDefs }: any) => (
    <table>
      <thead><tr>{columnDefs.map((c: any, i: number) => <th key={i}>{c.headerName}</th>)}</tr></thead>
      <tbody>{rowData.map((r: any, i: number) => <tr key={i}><td>{r.__label}</td></tr>)}</tbody>
    </table>
  ),
}));

import { Pivot } from "./Pivot";
import { AppProvider } from "../context/AppContext";
import { BINDINGS, DEFAULT_ROWS } from "../ap/bindings";
import fixture from "../ap/__fixtures__/discovery.json";

const FG = DEFAULT_ROWS[0];

const DIMS = {
  dimensions: ["Date", "Manager", "Sector", "Factor", "ScenarioSet"],
  measures: ["Net exposure", "Scenario VaR 99", "Factor contribution"],
  scenario_dependent: ["Scenario VaR 99"],
  members: { Date: ["2024-12-31"], ScenarioSet: ["HistFull"], Sector: [], Factor: [], Manager: ["Soros", "TigerGlobal"] },
  dates: ["2024-12-31"], scenario_sets: ["HistFull"],
};
const META = {
  dates: ["2024-12-31"], scenario_sets: ["HistFull"], factors: ["Market"], ts_measures: [], by_levels: [],
  managers: [
    { manager: "Soros", entity_name: null, firm_type: null, cik: null, n_positions_distinct: null },
    { manager: "TigerGlobal", entity_name: null, firm_type: null, cik: null, n_positions_distinct: null },
  ],
};

const REJECTION_PREFIX = '["Factor contribution"] are manager-independent';
const REJECTION_TAIL = "under every manager's label.";

// the saved view a user picks that happens to select a manager-independent measure
const REJECTED_VIEW = {
  schema_version: 2, name: "Factor contribution by name", path: "Public", created: "", updated: "",
  state: { rows: [FG], cols: [], measures: ["Factor contribution"],
           filters: { [BINDINGS.manager]: ["Soros"], [BINDINGS.date]: ["2024-12-31"] }, row_tot: false, render: "grid" },
};

// A cellset for whatever the MDX asked: one row (when ON ROWS) and one cell per [Measures].[..] named.
function cellsetFor(mdx: string) {
  const measures = [...mdx.matchAll(/\[Measures\]\.\[([^\]]+)\]/g)].map((m) => m[1]);
  const hasRows = mdx.includes(" ON ROWS");
  return {
    axes: [
      { id: 0, hierarchies: [{ dimension: "Measures", hierarchy: "Measures" }],
        positions: measures.map((m) => [{ namePath: [m], captionPath: [m] }]) },
      ...(hasRows ? [{ id: 1, hierarchies: [{ dimension: "FactorMeta", hierarchy: "FactorDim" }],
        positions: [[{ namePath: ["AllMember", "Style"], captionPath: ["AllMember", "Financials"] }]] }] : []),
    ],
    cells: measures.map((_, i) => ({ ordinal: i, value: i + 1, formattedValue: "" })),
  };
}

let mdxSent: string[] = [];

beforeEach(() => {
  mdxSent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://x");
    const p = u.pathname;
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (p.endsWith("/cube/discovery")) return json(fixture);
    if (p.endsWith("/cube/query/mdx")) {
      const mdx = JSON.parse(String(init?.body)).mdx as string;
      mdxSent.push(mdx);
      return json(cellsetFor(mdx));
    }
    if (p.endsWith("/dims")) return json(DIMS);
    if (p.endsWith("/meta")) return json(META);
    if (p.endsWith("/views")) return json({ sections: { Public: { folders: {}, views: [
      { name: REJECTED_VIEW.name, slug: "factor-contrib", path: "Public", file: "Public/factor-contrib.json" }] },
      Private: { folders: {}, views: [] } } });
    if (p.includes("/views/item/")) return json(REJECTED_VIEW);
    return json({});
  }) as unknown as typeof fetch);
});

function renderPivot() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/pivot"]}>
        <AppProvider><Pivot /></AppProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Pivot — manager-independent measure rejection", () => {
  it("surfaces the guard's rejection message and sends no MDX for the rejected query", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    const before = mdxSent.length;
    expect(before).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Factor contribution by name")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Factor contribution by name"));

    // the guard's text appears — not "Request failed" or a blank grid
    await waitFor(() => expect(screen.getByText(new RegExp(REJECTION_PREFIX.replace(/[[\]]/g, "\\$&")))).toBeInTheDocument());
    expect(screen.getByText(new RegExp(REJECTION_TAIL))).toBeInTheDocument();
    expect(screen.queryByText("Request failed")).toBeNull();
    // ... and the rejected query never reached ActivePivot
    expect(mdxSent.length).toBe(before);
    expect(mdxSent.some((m) => m.includes("Factor contribution"))).toBe(false);
  });
});
