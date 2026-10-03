import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCellSet } from "./client";

vi.mock("./client", async (orig) => ({ ...(await orig<typeof import("./client")>()), apMdx: vi.fn() }));

import { ApError, apMdx } from "./client";
import { fetchMembers, fetchPivotLevel, makeArgs } from "./pivotSource";
import { rulesFromDims, type Bindings, type GuardRules } from "./guards";
import { toCubeModel } from "./discovery";
import fixture from "./__fixtures__/discovery.json";
import type { RawDiscovery } from "./client";
import type { Dims } from "../api/types";

const MGR = "[Positions].[Manager].[Manager]";
const DATE = "[Exposures].[Date].[Date]";
const SCEN = "[Scenarios].[ScenarioSet].[ScenarioSet]";
const UNITS = "[Units].[Units].[Units]";
const COUNTRY = "[Securities].[Security].[Country]";
const SECTOR = "[Securities].[Security].[Sector]";
const FG = "[FactorMeta].[FactorDim].[FactorGroup]";
const BIND: Bindings = { manager: MGR, date: DATE, scenarioSet: SCEN, units: UNITS };

const dims: Dims = {
  dimensions: [],
  measures: [],
  scenario_dependent: ["Scenario VaR 99"],
  day_dependent: [],
  price_dependent: [],
  dollar_measures: ["Net exposure"],
  members: {},
  dates: ["2026-05-31", "2026-06-30"],
  scenario_sets: [],
};
const rules: GuardRules = rulesFromDims(dims, 1);
const model = toCubeModel(fixture as unknown as RawDiscovery);

// a cellset with one measures position per requested measure and the given row/col hierarchies
const cs = (rowsHier: [string, string] | null, hasCols: boolean, measures: string[]): RawCellSet => ({
  axes: [
    {
      id: 0,
      hierarchies: [
        { dimension: "Measures", hierarchy: "Measures" },
        ...(hasCols ? [{ dimension: "Scenarios", hierarchy: "ScenarioSet" }] : []),
      ],
      positions: measures.map((m) => [
        { namePath: [m], captionPath: [m] },
        ...(hasCols ? [{ namePath: ["AllMember", "HistFull"], captionPath: ["AllMember", "HistFull"] }] : []),
      ]),
    },
    ...(rowsHier
      ? [
          {
            id: 1,
            hierarchies: [{ dimension: rowsHier[0], hierarchy: rowsHier[1] }],
            positions: [[{ namePath: ["AllMember", "UK"], captionPath: ["AllMember", "United Kingdom"] }]],
          },
        ]
      : []),
  ],
  cells: measures.map((_, i) => ({ ordinal: i, value: i + 1, formattedValue: "" })),
});

// answer by MDX shape: rows axis present? col dim present?
function answer(mdx: string): RawCellSet {
  const m = /\[([^\]]*)\]\.\[([^\]]*)\]\.\[[^\]]*\]\.Members ON ROWS/.exec(mdx);
  const hasCols = mdx.includes("[Scenarios].[ScenarioSet].[ScenarioSet].Members");
  const measures = [...mdx.matchAll(/\[Measures\]\.\[([^\]]+)\]/g)].map((x) => x[1]);
  return cs(m ? [m[1], m[2]] : null, hasCols, measures);
}

const args = (over: Record<string, unknown> = {}) =>
  makeArgs(model, {
    rows: [COUNTRY],
    cols: [],
    measures: ["Net exposure"],
    filters: {},
    totals: false,
    rowTot: false,
    ...over,
  });

beforeEach(() => {
  vi.mocked(apMdx).mockReset();
  vi.mocked(apMdx).mockImplementation(async (mdx: string) => answer(mdx));
});

describe("makeArgs", () => {
  it("fills cube, slicing and depth from the model", () => {
    const a = args({ rows: [COUNTRY, SECTOR] });
    expect(a.cube).toBe("Exposures");
    expect(a.slicing).toContain(UNITS);
    expect(a.depth[COUNTRY]).toBe(1);
    expect(a.depth[SECTOR]).toBe(2);
  });
});

describe("fetchMembers", () => {
  it("sends one .Members MDX and maps path and label", async () => {
    vi.mocked(apMdx).mockImplementation(async () => ({
      axes: [
        {
          id: 0,
          hierarchies: [{ dimension: "Measures", hierarchy: "Measures" }],
          positions: [[{ namePath: ["contributors.COUNT"], captionPath: ["contributors.COUNT"] }]],
        },
        {
          id: 1,
          hierarchies: [{ dimension: "Securities", hierarchy: "Security" }],
          positions: [
            [{ namePath: ["AllMember", "UK"], captionPath: ["AllMember", "United Kingdom"] }],
            [{ namePath: ["AllMember", "US"], captionPath: ["AllMember", "US"] }],
          ],
        },
      ],
      cells: [
        { ordinal: 0, value: 3, formattedValue: "" },
        { ordinal: 1, value: 4, formattedValue: "" },
      ],
    }));
    const ms = await fetchMembers(model, COUNTRY);
    expect(ms).toEqual([
      { path: "UK", label: "United Kingdom" },
      { path: "US", label: "US" },
    ]);
    expect(apMdx).toHaveBeenCalledTimes(1);
    const mdx = vi.mocked(apMdx).mock.calls[0][0];
    expect(mdx).toContain(`${COUNTRY}.Members ON ROWS`);
    expect(mdx).toContain("[Measures].[contributors.COUNT]");
  });

  it("a deeper level's path carries every ancestor", async () => {
    vi.mocked(apMdx).mockImplementation(async () => ({
      axes: [
        {
          id: 0,
          hierarchies: [{ dimension: "Measures", hierarchy: "Measures" }],
          positions: [[{ namePath: ["contributors.COUNT"], captionPath: ["contributors.COUNT"] }]],
        },
        {
          id: 1,
          hierarchies: [{ dimension: "Securities", hierarchy: "Security" }],
          positions: [[{ namePath: ["AllMember", "UK", "Energy"], captionPath: ["AllMember", "UK", "Energy"] }]],
        },
      ],
      cells: [{ ordinal: 0, value: 3, formattedValue: "" }],
    }));
    expect(await fetchMembers(model, SECTOR)).toEqual([{ path: "UK␞Energy", label: "Energy" }]);
  });

  it("a level the model does not have throws before any call", async () => {
    await expect(fetchMembers(model, "[No].[Such].[Level]")).rejects.toThrow(/no depth|not in the cube/);
    expect(apMdx).not.toHaveBeenCalled();
  });
});

describe("fetchPivotLevel", () => {
  it("a guard refusal throws ApError 400 and sends no MDX", async () => {
    const mm = { ...rules, multiManager: true };
    const p = fetchPivotLevel(args({ measures: ["Factor contribution"] }), mm, BIND);
    await expect(p).rejects.toBeInstanceOf(ApError);
    await expect(p).rejects.toMatchObject({ status: 400 });
    await expect(p).rejects.toThrow(/manager-independent/);
    expect(apMdx).not.toHaveBeenCalled();
  });

  it("no totals: exactly one MDX call, margins absent", async () => {
    const res = await fetchPivotLevel(args(), rules, BIND);
    expect(apMdx).toHaveBeenCalledTimes(1);
    expect(res.per_row).toBeUndefined();
    expect(res.per_col).toBeUndefined();
    expect(res.grand).toBeUndefined();
    expect(res.totals).toBe(false);
    expect(res.records).toHaveLength(1);
    expect(res.warning).toBeNull();
  });

  it("totals with a col dim and rowTot: four MDX calls, each margin from its own query", async () => {
    const res = await fetchPivotLevel(
      args({ cols: [SCEN], totals: true, rowTot: true, filters: { [SCEN]: ["HistFull", "Evt"] } }),
      rules,
      BIND,
    );
    expect(apMdx).toHaveBeenCalledTimes(4);
    const texts = vi.mocked(apMdx).mock.calls.map((c) => c[0]);
    const withRows = texts.filter((t) => t.includes(" ON ROWS"));
    const withCols = texts.filter((t) => t.includes("[ScenarioSet].Members"));
    expect(withRows).toHaveLength(2); // body, per_row
    expect(withCols).toHaveLength(2); // body, per_col
    expect(texts.filter((t) => !t.includes(" ON ROWS") && !t.includes("[ScenarioSet].Members"))).toHaveLength(1); // grand
    expect(res.totals).toBe(true);
    expect(res.per_row).toBeDefined();
    expect(res.per_col).toBeDefined();
    expect(res.grand).toEqual({ "Net exposure": 1 });
  });

  it("totals without a col dim: body and grand only", async () => {
    await fetchPivotLevel(args({ totals: true }), rules, BIND);
    expect(apMdx).toHaveBeenCalledTimes(2);
  });

  it("passes the abort signal to every MDX call", async () => {
    const ac = new AbortController();
    await fetchPivotLevel(args({ totals: true }), rules, BIND, ac.signal);
    for (const c of vi.mocked(apMdx).mock.calls) expect(c[1]?.signal).toBe(ac.signal);
  });

  it("a guard notice ends up in warning, and the added Date filter reaches every MDX", async () => {
    const res = await fetchPivotLevel(
      args({ rows: [MGR], measures: ["Scenario VaR 99"], totals: true, filters: { [SCEN]: ["HistFull"] } }),
      rules,
      BIND,
    );
    expect(res.warning).toMatch(/latest date 2026-06-30/);
    const texts = vi.mocked(apMdx).mock.calls.map((c) => c[0]);
    expect(texts.length).toBe(2);
    for (const t of texts) expect(t).toContain("[Exposures].[Date].[ALL].[AllMember].[2026-06-30]");
  });

  it("Units $ sets units and the requested dollar measures; Units absent does not", async () => {
    const usd = await fetchPivotLevel(
      args({ measures: ["Net exposure", "Manager MV"], filters: { [UNITS]: ["$"] } }),
      rules,
      BIND,
    );
    expect(usd.units).toBe("dollar");
    expect(usd.dollar_measures).toEqual(["Net exposure"]);
    const w = await fetchPivotLevel(args(), rules, BIND);
    expect(w.units).toBeUndefined();
    expect(w.dollar_measures).toBeUndefined();
  });

  it("an AP error propagates unchanged", async () => {
    vi.mocked(apMdx).mockRejectedValueOnce(new ApError(400, "retrieval exceeded the limit"));
    await expect(fetchPivotLevel(args(), rules, BIND)).rejects.toThrow("retrieval exceeded the limit");
  });

  it("uses the deepest level of one hierarchy and the model's depth for the records", async () => {
    vi.mocked(apMdx).mockImplementation(async () => ({
      axes: [
        { id: 0, hierarchies: [{ dimension: "Measures", hierarchy: "Measures" }], positions: [[{ namePath: ["Net exposure"], captionPath: ["Net exposure"] }]] },
        {
          id: 1,
          hierarchies: [{ dimension: "Securities", hierarchy: "Security" }],
          positions: [[{ namePath: ["AllMember", "UK", "Energy"], captionPath: ["AllMember", "United Kingdom", "Energy"] }]],
        },
      ],
      cells: [{ ordinal: 0, value: 5, formattedValue: "" }],
    }));
    const res = await fetchPivotLevel(args({ rows: [COUNTRY, SECTOR], filters: { [COUNTRY]: ["UK"] } }), rules, BIND);
    expect(vi.mocked(apMdx).mock.calls[0][0]).toContain(`${SECTOR}.Members`);
    expect(res.records[0][SECTOR]).toBe("UK␞Energy");
    expect(res.records[0][COUNTRY]).toBe("UK");
  });

  it("a FactorGroup row query builds (model carries its depth)", async () => {
    await fetchPivotLevel(args({ rows: [FG] }), rules, BIND);
    expect(vi.mocked(apMdx).mock.calls[0][0]).toContain(`${FG}.Members`);
  });
});
