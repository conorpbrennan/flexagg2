import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PivotResult, Rec } from "../api/types";
import type { Dims } from "../api/types";

vi.mock("../ap/pivotSource", async (orig) => ({ ...(await orig<typeof import("../ap/pivotSource")>()), fetchPivotLevel: vi.fn() }));

import { fetchPivotLevel } from "../ap/pivotSource";
import { rulesFromDims } from "../ap/guards";
import { toCubeModel } from "../ap/discovery";
import type { RawDiscovery } from "../ap/client";
import fixture from "../ap/__fixtures__/discovery.json";
import { rowsFromRecords, mergeFilters, usePivot, COL_SEP, TOTAL_COL, type PivotConfig } from "./usePivot";

const SEP = "␞";
const COUNTRY = "[Securities].[Security].[Country]";
const SECTOR = "[Securities].[Security].[Sector]";
const ISSUER = "[Securities].[Security].[Issuer]";
const FG = "[FactorMeta].[FactorDim].[FactorGroup]";
const SCEN = "[Scenarios].[ScenarioSet].[ScenarioSet]";
const DATE = "[Exposures].[Date].[Date]";
const UNITS = "[Units].[Units].[Units]";
const NE = "Net exposure";

const model = toCubeModel(fixture as unknown as RawDiscovery);
const dims: Dims = {
  dimensions: [], measures: [], scenario_dependent: ["Scenario VaR 99"], day_dependent: [], price_dependent: [],
  dollar_measures: [NE], members: {}, dates: ["2026-06-30"], scenario_sets: [],
};
const rules = rulesFromDims(dims, 1);

describe("pivot drill helpers", () => {
  it("mergeFilters pins a parent member onto the base slicers", () => {
    const f = mergeFilters({ [DATE]: ["2026-06-30"] }, { [FG]: "Value" });
    expect(f).toEqual({ [DATE]: ["2026-06-30"], [FG]: ["Value"] });
  });

  it("mergeFilters: a deeper path entry replaces the parent's filter on the same hierarchy", () => {
    const f = mergeFilters({ [DATE]: ["d"] }, { [COUNTRY]: "UK", [SECTOR]: `UK${SEP}Energy` });
    expect(f).toEqual({ [DATE]: ["d"], [SECTOR]: [`UK${SEP}Energy`] });
    expect(Object.keys(f).filter((k) => k.includes("[Security]"))).toHaveLength(1);
  });

  it("mergeFilters: a path entry replaces a user filter on another level of its hierarchy", () => {
    const f = mergeFilters({ [COUNTRY]: ["UK", "US"] }, { [SECTOR]: `UK${SEP}Energy` });
    expect(f).toEqual({ [SECTOR]: [`UK${SEP}Energy`] });
  });

  it("rowsFromRecords keys rows by the member path, shows the caption, sets level, marks expandable", () => {
    const records: Rec[] = [
      { [FG]: "Value", [`${FG}#label`]: "Value factor", [NE]: 0.5 },
      { [FG]: "Momentum", [`${FG}#label`]: "Momentum", [NE]: 0.2 },
    ];
    const rows = rowsFromRecords(records, FG, undefined, [NE], 0, {}, "", true);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Value factor");
    expect(rows[0].level).toBe(0);
    expect(rows[0].expandable).toBe(true);
    expect(rows[0].values[`${COL_SEP}${NE}`]).toBe(0.5);
    expect(rows[0].path).toEqual({ [FG]: "Value" });
  });

  it("splices children one level deeper under the parent key (the drill)", () => {
    const children: Rec[] = [
      { [FG]: "Value", [ISSUER]: "A", [`${ISSUER}#label`]: "Acme", [NE]: 0.3 },
      { [FG]: "Value", [ISSUER]: "B", [`${ISSUER}#label`]: "Bolt", [NE]: 0.2 },
    ];
    const rows = rowsFromRecords(children, ISSUER, undefined, [NE], 1, { [FG]: "Value" }, "/Value", false);
    expect(rows).toHaveLength(2);
    expect(rows[0].level).toBe(1);
    expect(rows[0].key.startsWith("/Value/")).toBe(true);
    expect(rows[0].label).toBe("Acme");
    expect(rows[0].path).toEqual({ [FG]: "Value", [ISSUER]: "A" });
    expect(rows[0].expandable).toBe(false);
  });

  it("spreads a col dimension into per-(colMember path, measure) value keys", () => {
    const records: Rec[] = [
      { [SECTOR]: "Tech", [SCEN]: "HistFull", "Scenario VaR 99": 0.04 },
      { [SECTOR]: "Tech", [SCEN]: "Evt:COVID2020", "Scenario VaR 99": 0.09 },
    ];
    const rows = rowsFromRecords(records, SECTOR, SCEN, ["Scenario VaR 99"], 0, {}, "", false);
    expect(rows).toHaveLength(1);
    expect(rows[0].values[`HistFull${COL_SEP}Scenario VaR 99`]).toBe(0.04);
    expect(rows[0].values[`Evt:COVID2020${COL_SEP}Scenario VaR 99`]).toBe(0.09);
  });
});

const result = (records: Rec[], extra: Partial<PivotResult> = {}): PivotResult => ({
  rows: [], cols: [], measures: [NE], totals: false, warning: null, records, ...extra,
});
const mockFetch = vi.mocked(fetchPivotLevel);

const rec = (k: string, label: string, v: number, extra: Rec = {}): Rec => ({ [k]: label, [`${k}#label`]: label, [NE]: v, ...extra });
const initial: Partial<PivotConfig> = {
  rows: [COUNTRY, SECTOR, ISSUER], cols: [], measures: [NE], filters: { [DATE]: ["2026-06-30"] },
  totals: false, rowTot: false, units: "weight",
};
const withSrc = (init: Partial<PivotConfig>, r: typeof rules | null = rules, m: typeof model | null = model) =>
  renderHook(() => usePivot(init, { model: m, rules: r }));

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(result([]));
});

describe("usePivot reload", () => {
  it("null guard rules means wait: no fetch at all", async () => {
    const { result: h } = withSrc(initial, null);
    await act(async () => { await h.current.reload(); });
    expect(mockFetch).not.toHaveBeenCalled();
    const m = withSrc(initial, rules, null);
    await act(async () => { await m.result.current.reload(); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("one fetchPivotLevel call for the base level, filters and the model passed through", async () => {
    mockFetch.mockResolvedValue(result([rec(COUNTRY, "UK", 1)]));
    const { result: h } = withSrc(initial);
    await act(async () => { await h.current.reload(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [args, r, bind] = mockFetch.mock.calls[0];
    expect(args.rows).toEqual([COUNTRY]);
    expect(args.cols).toEqual([]);
    expect(args.cube).toBe("Exposures");
    expect(args.depth[COUNTRY]).toBe(1);
    expect(args.filters).toEqual({ [DATE]: ["2026-06-30"] });
    expect(args.totals).toBe(false);
    expect(r).toBe(rules);
    expect(bind.units).toBe(UNITS);
    expect(h.current.flat.map((x) => x.label)).toEqual(["UK"]);
  });

  it("units dollar adds the Units $ filter, and the result's dollar measures reach the grid", async () => {
    mockFetch.mockResolvedValue(result([rec(COUNTRY, "UK", 1)], { units: "dollar", dollar_measures: [NE] }));
    const { result: h } = withSrc({ ...initial, units: "dollar" });
    await act(async () => { await h.current.reload(); });
    expect(mockFetch.mock.calls[0][0].filters[UNITS]).toEqual(["$"]);
    expect(h.current.dollarMeasures).toEqual([NE]);
    expect(h.current.cfg.filters[UNITS]).toBeUndefined(); // the saved filters stay the user's own
  });

  it("totals come from the same fetch: grand, per_col and per_row, never summed", async () => {
    mockFetch.mockResolvedValue(result(
      [rec(COUNTRY, "UK", 1, { [SCEN]: "H", [`${SCEN}#label`]: "Hist" })],
      {
        per_row: [rec(COUNTRY, "UK", 7)],
        per_col: [{ [SCEN]: "H", [`${SCEN}#label`]: "Hist", [NE]: 9 }],
        grand: { [NE]: 11 },
      },
    ));
    const { result: h } = withSrc({ ...initial, cols: [SCEN], totals: true, rowTot: true });
    await act(async () => { await h.current.reload(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const a = mockFetch.mock.calls[0][0];
    expect(a.totals).toBe(true);
    expect(a.rowTot).toBe(true);
    expect(a.cols).toEqual([SCEN]);
    expect(h.current.grand[`${COL_SEP}${NE}`]).toBe(11);
    expect(h.current.grand[`H${COL_SEP}${NE}`]).toBe(9);
    expect(h.current.grand[`${TOTAL_COL}${COL_SEP}${NE}`]).toBe(11);
    expect(h.current.flat[0].values[`${TOTAL_COL}${COL_SEP}${NE}`]).toBe(7);
    expect(h.current.colMembers).toEqual(["H", TOTAL_COL]);
  });

  it("captions: level keys from the model, column members from the result's #label", async () => {
    mockFetch.mockResolvedValue(result([rec(COUNTRY, "UK", 1, { [SCEN]: "H", [`${SCEN}#label`]: "Hist full" })]));
    const { result: h } = withSrc({ ...initial, cols: [SCEN] });
    await act(async () => { await h.current.reload(); });
    expect(h.current.captions[COUNTRY]).toBe("Country");
    expect(h.current.captions[SCEN]).toBe("ScenarioSet");
    expect(h.current.captions.H).toBe("Hist full");
  });

  it("a refusal from fetchPivotLevel shows as the error", async () => {
    mockFetch.mockRejectedValue(new Error("Scenario measures need one ScenarioSet"));
    const { result: h } = withSrc(initial);
    await act(async () => { await h.current.reload(); });
    expect(h.current.error).toBe("Scenario measures need one ScenarioSet");
  });
});

describe("usePivot drill", () => {
  it("expand issues one query for the next level, filtered to the parent path", async () => {
    mockFetch.mockResolvedValueOnce(result([rec(COUNTRY, "UK", 1)]));
    const { result: h } = withSrc(initial);
    await act(async () => { await h.current.reload(); });
    mockFetch.mockResolvedValueOnce(result([rec(COUNTRY, "UK", 1, { [SECTOR]: `UK${SEP}Energy`, [`${SECTOR}#label`]: "Energy" })]));
    await act(async () => { await h.current.toggleExpand(h.current.flat[0]); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const a = mockFetch.mock.calls[1][0];
    expect(a.rows).toEqual([COUNTRY, SECTOR]);
    expect(a.depth[SECTOR]).toBe(2);
    expect(a.filters).toEqual({ [DATE]: ["2026-06-30"], [COUNTRY]: ["UK"] });
    expect(a.totals).toBe(false);
    await waitFor(() => expect(h.current.flat.map((x) => x.label)).toEqual(["UK", "Energy"]));
  });

  it("a second drill replaces the parent filter on the same hierarchy", async () => {
    mockFetch.mockResolvedValueOnce(result([rec(COUNTRY, "UK", 1)]));
    const { result: h } = withSrc(initial);
    await act(async () => { await h.current.reload(); });
    mockFetch.mockResolvedValueOnce(result([rec(COUNTRY, "UK", 1, { [SECTOR]: `UK${SEP}Energy`, [`${SECTOR}#label`]: "Energy" })]));
    await act(async () => { await h.current.toggleExpand(h.current.flat[0]); });
    mockFetch.mockResolvedValueOnce(result([]));
    await act(async () => { await h.current.toggleExpand(h.current.flat[1]); });
    const a = mockFetch.mock.calls[2][0];
    expect(a.rows).toEqual([COUNTRY, SECTOR, ISSUER]);
    expect(a.filters[SECTOR]).toEqual([`UK${SEP}Energy`]);
    expect(a.filters[COUNTRY]).toBeUndefined();
  });
});
