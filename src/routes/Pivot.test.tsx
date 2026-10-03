// Reproduces the "load a saved report → grid shows the PREVIOUS view until you click again" bug
// (screenshot 2026-07-01: field list = ScenarioSet/Risk HHI, but grid still showed Sector rows with
// blank cells). Root cause was loadViewState firing a deferred reload() that closed over the stale
// cfg; the fix passes the new config explicitly to reload(next). This test drives the real component
// with AG Grid mocked to a plain table, discovery/dims/meta stubbed on fetch and fetchPivotLevel
// mocked, and asserts the grid re-queries + re-renders with the loaded view's rows on the FIRST load.
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";

// AG Grid -> a trivial table so jsdom can render rows/columns we can assert on.
vi.mock("ag-grid-react", () => ({
  AgGridReact: ({ rowData, columnDefs }: any) => (
    <table>
      <thead><tr>{columnDefs.map((c: any, i: number) => <th key={i}>{c.headerName}</th>)}</tr></thead>
      <tbody>
        {rowData.map((r: any, i: number) => <tr key={i}><td>{r.__label}</td></tr>)}
      </tbody>
    </table>
  ),
}));
vi.mock("../ap/pivotSource", async (orig) => ({ ...(await orig<typeof import("../ap/pivotSource")>()), fetchPivotLevel: vi.fn() }));

import { Pivot } from "./Pivot";
import { AppProvider } from "../context/AppContext";
import { ContextBar } from "../shell/ContextBar";
import { fetchPivotLevel } from "../ap/pivotSource";
import { BINDINGS, DEFAULT_ROWS } from "../ap/bindings";
import fixture from "../ap/__fixtures__/discovery.json";

const SCEN = BINDINGS.scenarioSet;
const DATE = BINDINGS.date;
const MGR = BINDINGS.manager;
const FG = DEFAULT_ROWS[0];

const DIMS = {
  dimensions: ["Date", "Manager", "Sector", "ScenarioSet"],
  measures: ["Net exposure", "Scenario VaR 99", "Risk HHI"],
  scenario_dependent: ["Scenario VaR 99", "Risk HHI"],
  members: { Date: ["2024-12-31"], ScenarioSet: ["HistFull"], Sector: [], Manager: ["Soros"] },
  dates: ["2024-11-30", "2024-12-31"], scenario_sets: ["HistFull"],
};
const META = {
  dates: ["2024-11-30", "2024-12-31"], scenario_sets: ["HistFull", "Evt:COVID2020"], factors: [], ts_measures: [], by_levels: [],
  managers: [{ manager: "Soros", entity_name: null, firm_type: null, cik: null, n_positions_distinct: null }],
};

// the saved "Concentration — Risk HHI" view: ScenarioSet on rows, Risk HHI measure, an older Date
const HHI_VIEW = {
  schema_version: 1, name: "Concentration — Risk HHI", path: "Public", created: "", updated: "",
  state: { rows: [SCEN], cols: [], measures: ["Risk HHI"],
           filters: { [MGR]: ["Soros"], [DATE]: ["2024-11-30"] }, row_tot: false, render: "grid" },
};

const rec = (k: string, v: string) => ({ [k]: v, [`${k}#label`]: v });
let metaHangs = false;

beforeEach(() => {
  metaHangs = false;
  vi.mocked(fetchPivotLevel).mockReset();
  vi.mocked(fetchPivotLevel).mockImplementation(async (a) => {
    // distinct rows per requested level so we can tell which query populated the grid
    const records = a.rows[0] === FG
      ? [{ ...rec(FG, "Financials"), "Net exposure": 1 }, { ...rec(FG, "Energy"), "Net exposure": 2 }]
      : a.rows[0] === SCEN
        ? [{ ...rec(SCEN, "HistFull"), "Risk HHI": 0.03 }, { ...rec(SCEN, "Hypo:RiskOff"), "Risk HHI": 0.18 }]
        : [];
    return { rows: a.rows, cols: a.cols, measures: a.measures, totals: false, warning: null, records };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(url, "http://x");
    const p = u.pathname;
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (p.endsWith("/cube/discovery")) return json(fixture);
    if (p.endsWith("/dims")) return json(DIMS);
    if (p.endsWith("/meta")) return metaHangs ? new Promise(() => {}) : json(META);
    if (p.endsWith("/views")) return json({ sections: { Public: { folders: {}, views: [
      { name: HHI_VIEW.name, slug: "concentration-hhi", path: "Public", file: "Public/concentration-hhi.json" }] },
      Private: { folders: {}, views: [] } } });
    if (p.includes("/views/item/")) return json(HHI_VIEW);
    return json({});
  }) as unknown as typeof fetch);
});

function renderPivot(withBar = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/pivot"]}>
        <AppProvider>
          {withBar && <ContextBar />}
          <Pivot />
        </AppProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = () => vi.mocked(fetchPivotLevel).mock.calls;
const lastFilters = () => calls()[calls().length - 1][0].filters;
const callsWithScenario = (scen: string) => calls().some(([a]) => a.filters[SCEN]?.[0] === scen);

describe("Pivot — loading a saved view", () => {
  it("shows the loaded view's rows on the FIRST click (not the previous view's stale rows)", async () => {
    renderPivot();

    // initial default view: FactorGroup rows
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());

    // open the Repository and click the saved HHI view (one click)
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Concentration — Risk HHI")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Concentration — Risk HHI"));

    // FIRST click must render the HHI view's ScenarioSet rows, and the stale rows must be gone
    await waitFor(() => expect(screen.getByText("HistFull")).toBeInTheDocument());
    expect(screen.getByText("Hypo:RiskOff")).toBeInTheDocument();
    expect(screen.queryByText("Financials")).not.toBeInTheDocument();
  });

  it("prefills the Repository save form with the opened view's name, folder and description", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Concentration — Risk HHI")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Concentration — Risk HHI"));
    // the save form now names THIS view, so a tweak + Save overwrites it instead of an unnamed copy
    await waitFor(() => expect(screen.getByPlaceholderText("view name")).toHaveValue("Concentration — Risk HHI"));
    expect(screen.getByDisplayValue("Public")).toBeInTheDocument();
  });

  it("shows the display options (decimals etc.) in the builder's Display zone", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.getByText("Display")).toBeInTheDocument();
    const dec = screen.getByLabelText(/decimals/) as HTMLInputElement;
    expect(dec.value).toBe("3");
    expect(screen.getByLabelText(/hide empty/)).toBeInTheDocument();
    expect(screen.getByLabelText(/total row/)).toBeInTheDocument();
  });

  it("updates the Fields section (R/C/F/M) to the loaded view", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());

    // default filters chips include the context bar's ScenarioSet=HistFull
    expect(screen.getByText("ScenarioSet=HistFull")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Concentration — Risk HHI")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Concentration — Risk HHI"));

    // the loaded view's FILTERS replace the defaults: Date=2024-11-30 in, ScenarioSet=HistFull out
    await waitFor(() => expect(screen.getByText("Date=2024-11-30")).toBeInTheDocument());
    expect(screen.getByText("Manager=Soros")).toBeInTheDocument();
    expect(screen.queryByText("ScenarioSet=HistFull")).not.toBeInTheDocument();
    // chips show captions, never the bracketed unique name or the key separator
    for (const chip of screen.getAllByText(/^\w+=/)) expect(chip.textContent).not.toMatch(/[[␞]/);
  });

  it("re-queries the cube when the scenario dropdown changes", async () => {
    renderPivot(true);
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    // default context scenario is folded into the pivot query
    await waitFor(() => expect(callsWithScenario("HistFull")).toBe(true));

    // change the context-bar scenario dropdown (the select currently holding "HistFull")
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const scen = selects.find((s) => s.value === "HistFull")!;
    fireEvent.change(scen, { target: { value: "Evt:COVID2020" } });

    // the pivot must re-query with the NEW scenario (numbers update, not just the chip)
    await waitFor(() => expect(callsWithScenario("Evt:COVID2020")).toBe(true));
  });
});

describe("Pivot — context and guards", () => {
  it("folds manager, latest date and scenario into the query as level-key filters", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    // units default to $, which is a Units-context filter; weight would add nothing
    expect(lastFilters()).toEqual({
      [MGR]: ["Soros"], [DATE]: ["2024-12-31"], [SCEN]: ["HistFull"], [BINDINGS.units]: ["$"],
    });
    expect(calls()[0][0].rows).toEqual([FG]);
  });

  it("a filter the user chose on a context level wins over the context (it survives a scenario change)", async () => {
    renderPivot(true);
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Concentration — Risk HHI")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Concentration — Risk HHI"));
    await waitFor(() => expect(screen.getByText("HistFull")).toBeInTheDocument());

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(selects.find((s) => s.value === "HistFull")!, { target: { value: "Evt:COVID2020" } });
    await waitFor(() => expect(screen.getByText("Date=2024-11-30")).toBeInTheDocument());
    // the view's Date (not the context's latest) is still the one queried; ScenarioSet is on rows, so no slice
    await waitFor(() => expect(lastFilters()[DATE]).toEqual(["2024-11-30"]));
    expect(lastFilters()[SCEN]).toBeUndefined();
  });

  it("runs no query while the guard rules have not loaded (/meta pending)", async () => {
    metaHangs = true;
    renderPivot();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchPivotLevel).not.toHaveBeenCalled();
  });

  it("has no what-if bar and no commentary panel", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.queryByText(/Hypothetical/)).toBeNull();
    expect(screen.queryByText(/Risk-analyst commentary/)).toBeNull();
  });
});
