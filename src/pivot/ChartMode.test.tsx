// Verifies chart mode renders a SELF-DESCRIBING saved view: it runs each named query (through
// fetchPivotLevel, no drill) and binds that query's records into the matching spec (by `source`).
// Reproduces the "Scenario P&L — COVID 2020" bug where the saved queries/chart were ignored and nothing
// rendered. react-vega is mocked to a probe; fetchPivotLevel is mocked per query.
import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// probe: bound row count, the first record's keys, whether a `source` leaked, the builder's x/y channels
vi.mock("react-vega", () => ({
  VegaLite: ({ spec, data }: {
    spec: { data?: { values?: Record<string, unknown>[] }; source?: string;
      encoding?: { x?: { field?: string; axis?: { title?: string } }; y?: { field?: string; axis?: { title?: string } } } };
    data?: { table?: Record<string, unknown>[] };
  }) => {
    const rows = spec.data?.values ?? data?.table ?? [];
    return (
      <div data-testid="vega" data-rows={rows.length} data-keys={Object.keys(rows[0] ?? {}).join(",")}
        data-hassource={String("source" in spec)}
        data-x={spec.encoding?.x?.field ?? ""} data-xtitle={spec.encoding?.x?.axis?.title ?? ""}
        data-y={spec.encoding?.y?.field ?? ""} data-ytitle={spec.encoding?.y?.axis?.title ?? ""} />
    );
  },
}));
vi.mock("../ap/pivotSource", async (orig) => ({ ...(await orig<typeof import("../ap/pivotSource")>()), fetchPivotLevel: vi.fn() }));

import { ChartMode, type VegaSpec } from "./ChartMode";
import { fetchPivotLevel } from "../ap/pivotSource";
import { rulesFromDims } from "../ap/guards";
import { toCubeModel } from "../ap/discovery";
import type { RawDiscovery } from "../ap/client";
import fixture from "../ap/__fixtures__/discovery.json";
import type { PivotQuery, Dims } from "../api/types";
import { BINDINGS } from "../ap/bindings";

const DAY = "[ScenarioDays].[Day].[Day]";
const DAYDATE = "[ScenarioDays].[DayDate].[DayDate]";
const DAYSET = "[ScenarioDays].[DaySet].[DaySet]";
const SECTOR = "[Securities].[Security].[Sector]";
const MGR = "[Positions].[Manager].[Manager]";
const SCEN = "[Scenarios].[ScenarioSet].[ScenarioSet]";
const FG = "[FactorMeta].[FactorDim].[FactorGroup]";

const model = toCubeModel(fixture as unknown as RawDiscovery);
const dims: Dims = {
  dimensions: [], measures: [], scenario_dependent: ["Scenario VaR 99"], day_dependent: [], price_dependent: [],
  dollar_measures: [], members: {}, dates: ["2026-06-30"], scenario_sets: [],
};
const rules = rulesFromDims(dims, 1);

// The per-day path (Day/DayDate levels + PnL at day, sliced by DaySet) the saved COVID chart views author.
const QUERIES: PivotQuery[] = [
  { name: "Scenario P&L", rows: [DAY, DAYDATE], cols: [], measures: ["PnL at day"],
    filters: { [MGR]: ["Soros"], [SCEN]: ["Evt:COVID2020"], [DAYSET]: ["Evt:COVID2020"] } },
  { name: "Scenario P&L by Sector", rows: [DAY, DAYDATE, SECTOR], cols: [], measures: ["PnL at day"],
    filters: { [MGR]: ["Soros"], [SCEN]: ["Evt:COVID2020"], [DAYSET]: ["Evt:COVID2020"] } },
];
const CHART: VegaSpec[] = [
  { source: "Scenario P&L", mark: "line", data: { name: "x" } },
  { source: "Scenario P&L by Sector", mark: "area", data: { name: "x" } },
];

beforeEach(() => {
  vi.mocked(fetchPivotLevel).mockReset();
  vi.mocked(fetchPivotLevel).mockImplementation(async (a) => {
    // path query -> 3 day rows; sector breakout -> 6 rows. Distinguishable by the rows requested.
    const n = a.rows.includes(SECTOR) ? 6 : 3;
    const records = Array.from({ length: n }, (_, i) => ({
      [DAY]: `${i}`, [`${DAY}#label`]: `${i}`, [DAYDATE]: `2020-03-0${i + 1}`, [`${DAYDATE}#label`]: `2020-03-0${i + 1}`,
      [SECTOR]: `S${i}`, [`${SECTOR}#label`]: `Sector ${i}`, [FG]: `F${i}`, [`${FG}#label`]: `Factor ${i}`,
      "PnL at day": i * 0.01, "Scenario VaR 99": i,
    }));
    return { rows: a.rows, cols: a.cols, measures: a.measures, totals: false, warning: null, records };
  });
});

const cfg = { rows: [FG], cols: [], measures: ["Scenario VaR 99"], filters: {},
  totals: false, rowTot: false, hideEmpty: true, heat: true, asPct: false, prec: 3, sort: [], units: "weight" as const };

describe("ChartMode — saved chart", () => {
  it("renders each saved spec with its query's records bound (source resolved + stripped)", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} savedQueries={QUERIES} savedChart={CHART} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(2));
    const charts = screen.getAllByTestId("vega");
    // spec 1 <- "Scenario P&L" (3 rows); spec 2 <- "...by Sector" (6 rows)
    expect(charts[0].getAttribute("data-rows")).toBe("3");
    expect(charts[1].getAttribute("data-rows")).toBe("6");
    // the non-standard `source` field must be stripped before handing the spec to Vega
    expect(charts[0].getAttribute("data-hassource")).toBe("false");
  });

  it("each named query goes through fetchPivotLevel with no drill and no totals", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} savedQueries={QUERIES} savedChart={CHART} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(2));
    const calls = vi.mocked(fetchPivotLevel).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].rows).toEqual([DAY, DAYDATE]);
    expect(calls[0][0].totals).toBe(false);
    expect(calls[0][0].depth[DAY]).toBe(1);
    expect(calls[0][1]).toBe(rules);
  });

  it("re-keys the records to plain aliases: dots and brackets never reach Vega-Lite", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} savedQueries={QUERIES} savedChart={CHART} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(2));
    expect(screen.getAllByTestId("vega")[0].getAttribute("data-keys")).toBe("f0,f1,f2");
  });

  it("waits, with no query, until the guard rules and model have loaded", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={null} savedQueries={QUERIES} savedChart={CHART} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchPivotLevel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("vega")).toBeNull();
  });

  it("shows the refusal when a query is rejected", async () => {
    vi.mocked(fetchPivotLevel).mockRejectedValue(new Error("pick one scenario set"));
    render(<ChartMode cfg={cfg} model={model} rules={rules} savedQueries={QUERIES} savedChart={CHART} />);
    await waitFor(() => expect(screen.getByText(/pick one scenario set/)).toBeInTheDocument());
  });
});

describe("ChartMode — builder", () => {
  it("falls back to the builder (single chart) when there is no saved chart", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(1));
  });

  it("charts aliased fields, titled with the level caption and the measure name", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(1));
    const v = screen.getByTestId("vega");
    expect(v.getAttribute("data-x")).toBe("f0");
    expect(v.getAttribute("data-xtitle")).toBe("FactorGroup");
    expect(v.getAttribute("data-y")).toBe("f1");
    expect(v.getAttribute("data-ytitle")).toBe("Scenario VaR 99");
    expect(v.getAttribute("data-keys")).toBe("f0,f1");
  });
});

// The grid (usePivot.queryLevel) adds the Units "$" filter under cfg.units === "dollar"; the chart beside
// it must carry the same context or it shows weight units while the grid shows dollars.
describe("ChartMode — units context matches the grid", () => {
  const dollar = { ...cfg, units: "dollar" as const };

  it("builder query carries Units $ under dollar", async () => {
    render(<ChartMode cfg={dollar} model={model} rules={rules} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(1));
    expect(vi.mocked(fetchPivotLevel).mock.calls[0][0].filters[BINDINGS.units]).toEqual(["$"]);
  });

  it("builder query adds nothing under weight", async () => {
    render(<ChartMode cfg={cfg} model={model} rules={rules} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(1));
    expect(BINDINGS.units in vi.mocked(fetchPivotLevel).mock.calls[0][0].filters).toBe(false);
  });

  it("named saved queries carry Units $ under dollar", async () => {
    render(<ChartMode cfg={dollar} model={model} rules={rules} savedQueries={QUERIES} savedChart={CHART} />);
    await waitFor(() => expect(screen.getAllByTestId("vega")).toHaveLength(2));
    for (const c of vi.mocked(fetchPivotLevel).mock.calls) expect(c[0].filters[BINDINGS.units]).toEqual(["$"]);
  });
});
