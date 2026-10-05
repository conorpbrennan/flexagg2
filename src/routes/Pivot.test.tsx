// Reproduces the "load a saved report → grid shows the PREVIOUS view until you click again" bug
// (screenshot 2026-07-01: field list = ScenarioSet/Risk HHI, but grid still showed Sector rows with
// blank cells). Root cause was loadViewState firing a deferred reload() that closed over the stale
// cfg; the fix passes the new config explicitly to reload(next). This test drives the real component
// with AG Grid mocked to a plain table, discovery/dims/meta stubbed on fetch and fetchPivotLevel
// mocked, and asserts the grid re-queries + re-renders with the loaded view's rows on the FIRST load.
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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
vi.mock("../pivot/ChartMode", () => ({ ChartMode: () => <div data-testid="chart-mode" /> }));
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
  schema_version: 2, name: "Concentration — Risk HHI", path: "Public", created: "", updated: "",
  state: { rows: [SCEN], cols: [], measures: ["Scenario VaR 99"],
           filters: { [MGR]: ["Soros"], [DATE]: ["2024-11-30"] }, row_tot: false, render: "grid" },
};

// a saved view with NO filters key that puts ScenarioSet on rows (falls back to the current filters)
const NOFILT_VIEW = {
  schema_version: 2, name: "Scenarios, no filters", path: "Public", created: "", updated: "",
  state: { rows: [SCEN], cols: [], measures: ["Scenario VaR 99"], render: "grid" },
};

const rec = (k: string, v: string) => ({ [k]: v, [`${k}#label`]: v });
let metaHangs = false;
let savedBody: { state: Record<string, unknown> } | null = null; // last PUT /views/save body

beforeEach(() => {
  metaHangs = false;
  savedBody = null;
  vi.mocked(fetchPivotLevel).mockReset();
  vi.mocked(fetchPivotLevel).mockImplementation(async (a) => {
    // distinct rows per requested level so we can tell which query populated the grid
    const records = a.rows[0] === FG
      ? [{ ...rec(FG, "Financials"), "Net exposure": 1 }, { ...rec(FG, "Energy"), "Net exposure": 2 }]
      : a.rows[0] === SCEN
        ? [{ ...rec(SCEN, "HistFull"), "Scenario VaR 99": 0.03 }, { ...rec(SCEN, "Hypo:RiskOff"), "Scenario VaR 99": 0.18 }]
        : [];
    return { rows: a.rows, cols: a.cols, measures: a.measures, totals: false, warning: null, records };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://x");
    const p = u.pathname;
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (p.endsWith("/cube/discovery")) return json(fixture);
    if (p.endsWith("/dims")) return json(DIMS);
    if (p.endsWith("/meta")) return metaHangs ? new Promise(() => {}) : json(META);
    if (p.endsWith("/views")) return json({ sections: { Public: { folders: {}, views: [
      ...(savedBody ? [{ name: "mine", slug: "mine", path: "Public", file: "Public/mine" }] : []),
      { name: HHI_VIEW.name, slug: "concentration-hhi", path: "Public", file: "Public/concentration-hhi.json" },
      { name: NOFILT_VIEW.name, slug: "nofilt", path: "Public", file: "Public/nofilt.json" }] },
      Private: { folders: {}, views: [] } } });
    if (p.endsWith("/views/save")) { savedBody = JSON.parse(init!.body as string); return json({ file: "Public/mine" }); }
    if (p.includes("/views/item/Public/mine")) return json({ ...HHI_VIEW, name: "mine", state: savedBody!.state });
    if (p.includes("/views/item/Public/nofilt")) return json(NOFILT_VIEW);
    if (p.includes("/views/item/")) return json(HHI_VIEW);
    return json({});
  }) as unknown as typeof fetch);
});

function renderPivot(withBar = false, path = "/pivot") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
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
// The number of fetchPivotLevel calls made while fn runs. Synchronous on purpose: a control's onChange
// calls reload(next), which calls fetchPivotLevel before its first await, and fireEvent runs inside act,
// which also flushes any effect-driven reload. So a query a change causes is recorded by the time
// fireEvent returns, and a 0 here needs no sleep to mean "no query".
const queriesDuring = (fn: () => void) => {
  const n = calls().length;
  fn();
  return calls().length - n;
};

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

  it("shows a guard refusal live while editing, before Apply, with no query", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.queryByTestId("guard-preview")).toBeNull();   // the shown grid's config passes
    // drop the context's ScenarioSet filter while a scenario measure is in Values
    const chip = screen.getByText(/^ScenarioSet=/, { selector: ".tag" });
    expect(queriesDuring(() => fireEvent.click(within(chip).getByTitle("remove")))).toBe(0);
    expect(screen.getByTestId("guard-preview").textContent).toMatch(/need one ScenarioSet/);
    expect(screen.getByTestId("guard-preview").className).toMatch(/\berr\b/);
    // Apply's half (the page line takes over) is in Pivot.rejection.test.tsx: here fetchPivotLevel is mocked
  });

  it("shows a guard notice live, in amber, for an edit Apply would run with a default", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    // Manager as the first row field with a scenario measure and no Date: Apply defaults to the latest date
    fireEvent.click(within(screen.getByText(/^Date=/, { selector: ".tag" })).getByTitle("remove"));
    fireEvent.click(within(screen.getByText(/FactorGroup/, { selector: ".tag" })).getByTitle("remove"));
    fireEvent.click(within(screen.getByTestId("level-Manager")).getByTitle("to rows"));
    const line = screen.getByTestId("guard-preview");
    expect(line.textContent).toMatch(/Defaulted to the latest date/);
    expect(line.className).toMatch(/rag-amber/);
  });

  it("has no what-if bar and no commentary panel", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.queryByText(/Hypothetical/)).toBeNull();
    expect(screen.queryByText(/Risk-analyst commentary/)).toBeNull();
  });

  it("does not save the context-folded Manager/Date/ScenarioSet, so a loaded view follows the context bar", async () => {
    renderPivot(true);
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Views"));
    fireEvent.change(screen.getByPlaceholderText("view name"), { target: { value: "mine" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(savedBody).not.toBeNull());
    expect(savedBody!.state.filters).toEqual({});

    // move the context bar to the older date, then load the saved view: it must use the CURRENT date
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(selects.find((s) => s.value === "2024-12-31")!, { target: { value: "2024-11-30" } });
    await waitFor(() => expect(lastFilters()[DATE]).toEqual(["2024-11-30"]));
    await waitFor(() => expect(screen.getByText("mine")).toBeInTheDocument());
    const before = calls().length;
    fireEvent.click(screen.getByText("mine"));
    await waitFor(() => expect(calls().length).toBeGreaterThan(before));
    expect(lastFilters()[DATE]).toEqual(["2024-11-30"]);
    expect(lastFilters()[MGR]).toEqual(["Soros"]);
    expect(lastFilters()[SCEN]).toEqual(["HistFull"]);
  });

  it("still saves a filter the user chose on a context level (different from the context)", async () => {
    renderPivot(true);
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText("Concentration — Risk HHI")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Concentration — Risk HHI")); // Date=2024-11-30 vs context 2024-12-31
    await waitFor(() => expect(screen.getByText("Date=2024-11-30")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(savedBody).not.toBeNull());
    expect(savedBody!.state.filters).toEqual({ [DATE]: ["2024-11-30"] });
  });

  it("a saved view without filters never leaves ScenarioSet both on an axis and filtered", async () => {
    renderPivot(true);
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    // the folded context filter is present before the load
    expect(screen.getByText("ScenarioSet=HistFull")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText(NOFILT_VIEW.name)).toBeInTheDocument());
    const before = calls().length;
    fireEvent.click(screen.getByText(NOFILT_VIEW.name));
    await waitFor(() => expect(calls().length).toBeGreaterThan(before));
    const last = calls()[calls().length - 1][0];
    expect(last.rows).toEqual([SCEN]);
    expect(last.filters[SCEN]).toBeUndefined();
    // the other context levels still follow the context
    expect(last.filters[DATE]).toEqual(["2024-12-31"]);
    await waitFor(() => expect(screen.queryByText("ScenarioSet=HistFull")).not.toBeInTheDocument());
  });
});

describe("Pivot — modes, panes and display options", () => {
  it("toggles between grid and chart mode", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.queryByTestId("chart-mode")).toBeNull();
    fireEvent.click(screen.getByText("Chart"));
    expect(await screen.findByTestId("chart-mode")).toBeInTheDocument();
    expect(screen.queryByText("Financials")).toBeNull();
    fireEvent.click(screen.getByText("Grid"));
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
  });

  it("the Views button opens the Repository and becomes Hide", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.queryByText("Repository")).toBeNull();
    fireEvent.click(screen.getByText("Views"));
    expect(await screen.findByText("Repository")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hide"));
    expect(screen.queryByText("Repository")).toBeNull();
  });

  it("a loaded view with no description says so, and the pane can be dismissed", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText(HHI_VIEW.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText(HHI_VIEW.name));
    expect(await screen.findByText(`About this view · ${HHI_VIEW.name}`)).toBeInTheDocument();
    expect(screen.getByText("No description saved for this view.")).toBeInTheDocument();
    expect(document.title).toBe(`${HHI_VIEW.name} · pivot`);
    fireEvent.click(screen.getByTitle("dismiss"));
    expect(screen.queryByText(/About this view/)).toBeNull();
  });

  it("switching units from $ re-queries without the Units context filter; % formats weights", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(lastFilters()[BINDINGS.units]).toEqual(["$"]);
    const sel = screen.getByDisplayValue("$") as HTMLSelectElement;
    expect(queriesDuring(() => fireEvent.change(sel, { target: { value: "%" } }))).toBe(1);
    expect(lastFilters()[BINDINGS.units]).toBeUndefined();
    expect((screen.getByDisplayValue("%") as HTMLSelectElement).value).toBe("%");
    // fraction vs % is only a format of the same numbers: no further query
    expect(queriesDuring(() => fireEvent.change(screen.getByDisplayValue("%"), { target: { value: "fraction" } }))).toBe(0);
    expect((screen.getByDisplayValue("fraction") as HTMLSelectElement).value).toBe("fraction");
  });

  it("the total-row checkbox re-queries; the total-column checkbox is disabled without a column field", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    expect(screen.getByLabelText(/total column/)).toBeDisabled();
    expect(calls()[calls().length - 1][0].totals).toBe(true);
    const before = calls().length;
    fireEvent.click(screen.getByLabelText(/total row/));
    await waitFor(() => expect(calls().length).toBeGreaterThan(before));
    expect(calls()[calls().length - 1][0].totals).toBe(false);
  });

  it("decimals are clamped to 0..6 and heat/hide-empty toggle without a query", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    const dec = screen.getByLabelText(/decimals/) as HTMLInputElement;
    fireEvent.change(dec, { target: { value: "9" } });
    expect(dec.value).toBe("6");
    fireEvent.change(dec, { target: { value: "-3" } });
    expect(dec.value).toBe("0");
    expect(queriesDuring(() => {
      fireEvent.change(dec, { target: { value: "2" } });
      fireEvent.click(screen.getByLabelText(/heat/));
      fireEvent.click(screen.getByLabelText(/hide empty/));
    })).toBe(0);
    expect((screen.getByLabelText(/heat/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/hide empty/) as HTMLInputElement).checked).toBe(false);
    // the control: a change that does query is caught the same synchronous way
    expect(queriesDuring(() => fireEvent.click(screen.getByLabelText(/total row/)))).toBe(1);
  });
});

describe("Pivot — cross-lens drill link", () => {
  const drill = (o: object) => `/pivot?drill=${encodeURIComponent(JSON.stringify(o))}`;

  it("a drill link with a malformed level key shows an error instead of crashing the page", async () => {
    renderPivot(false, drill({ rows: ["Manager"] }));   // keeps the default scenario measure
    expect(await screen.findByText(/bad level key: Manager/)).toBeInTheDocument();
    expect(screen.getByText("Fields")).toBeInTheDocument();
  });

  it("opens the drill's rows/measures/filters once, names the pane, and clears ?drill=", async () => {
    renderPivot(false, drill({
      rows: [SCEN], measures: ["Scenario VaR 99"], filters: { [DATE]: ["2024-11-30"] }, description: "from attribution",
    }));
    expect(await screen.findByText("About this view · drill-through")).toBeInTheDocument();
    expect(screen.getByText("from attribution")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hypo:RiskOff")).toBeInTheDocument());
    const a = calls()[calls().length - 1][0];
    expect(a.rows).toEqual([SCEN]);
    expect(a.measures).toEqual(["Scenario VaR 99"]);
    expect(a.filters[DATE]).toEqual(["2024-11-30"]);
    expect(calls().length).toBe(1);   // exactly one reload at mount: no race with the context fold
  });

  it("a drill with no description gets the default note; a malformed ?drill= is ignored", async () => {
    renderPivot(false, drill({ rows: [SCEN] }));
    expect(await screen.findByText("opened from another lens")).toBeInTheDocument();
    renderPivot(false, "/pivot?drill=%7Bnot-json");
    await waitFor(() => expect(screen.getAllByText("Financials").length).toBeGreaterThan(0));
  });
});

describe("Pivot — loading a view with an unreadable store", () => {
  it("a view that fails to open shows the error and leaves the grid alone", async () => {
    renderPivot();
    await waitFor(() => expect(screen.getByText("Financials")).toBeInTheDocument());
    const orig = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
      String(url).includes("/views/item/")
        ? { ok: false, status: 404, statusText: "", json: async () => ({ detail: "view not found" }) }
        : orig(url, init)) as unknown as typeof fetch);
    fireEvent.click(screen.getByText("Views"));
    await waitFor(() => expect(screen.getByText(HHI_VIEW.name)).toBeInTheDocument());
    fireEvent.click(screen.getByText(HHI_VIEW.name));
    expect(await screen.findByText("view not found")).toBeInTheDocument();
    expect(screen.getByText("Financials")).toBeInTheDocument();
  });
});
