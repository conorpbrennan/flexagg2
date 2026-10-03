import { describe, expect, it } from "vitest";
import { cellsetToRecords, labelKey, toPivotResult } from "./cellset";
import type { RawCellSet } from "./client";
import type { ApQuery } from "./mdx";
import rowsFx from "./__fixtures__/cellset-rows.json";
import rowsColsFx from "./__fixtures__/cellset-rows-cols.json";

const MGR = "[Positions].[Manager].[Manager]";
const COUNTRY = "[Securities].[Security].[Country]";
const SECTOR = "[Securities].[Security].[Sector]";
const UNITS = "[Units].[Units].[Units]";
const SEP = "␞";

const base: ApQuery = {
  cube: "Exposures",
  rows: [],
  cols: [],
  measures: ["Net exposure", "Scenario VaR 99"],
  filters: {},
  nonEmpty: false,
  slicing: [UNITS],
  depth: { [MGR]: 1, [COUNTRY]: 1, [SECTOR]: 2, [UNITS]: 1 },
};
const q = (o: Partial<ApQuery>): ApQuery => ({ ...base, ...o });

const rowsCs = rowsFx as unknown as RawCellSet;
const rowsColsCs = rowsColsFx as unknown as RawCellSet;

describe("labelKey", () => {
  it("appends #label", () => {
    expect(labelKey(SECTOR)).toBe(`${SECTOR}#label`);
  });
});

describe("cellsetToRecords, rows only", () => {
  const recs = cellsetToRecords(rowsCs, q({ rows: [COUNTRY, SECTOR] }));

  it("gives one record per row position, measures read by position not by q order", () => {
    expect(recs).toEqual([
      {
        [COUNTRY]: "UK", [`${COUNTRY}#label`]: "United Kingdom",
        [SECTOR]: `UK${SEP}Energy`, [`${SECTOR}#label`]: "Energy sector",
        "Scenario VaR 99": 11.5, "Net exposure": 1.5,
      },
      {
        [COUNTRY]: "US", [`${COUNTRY}#label`]: "United States",
        [SECTOR]: `US${SEP}Energy`, [`${SECTOR}#label`]: "Energy sector",
        "Scenario VaR 99": 22.5, "Net exposure": null,
      },
      {
        [COUNTRY]: "US", [`${COUNTRY}#label`]: "United States",
        [SECTOR]: `US${SEP}Tech`, [`${SECTOR}#label`]: "Technology",
        "Scenario VaR 99": 33.5, "Net exposure": 3.5,
      },
    ]);
  });

  it("fills a missing ordinal with null, never a number", () => {
    expect(recs[1]["Net exposure"]).toBeNull();
  });

  it("gives two Sector members with one caption different path values", () => {
    expect(recs[0][`${SECTOR}#label`]).toBe(recs[1][`${SECTOR}#label`]);
    expect(recs[0][SECTOR]).not.toBe(recs[1][SECTOR]);
  });

  it("fills a shallower level of the same hierarchy cut at its depth", () => {
    expect(recs.map((r) => r[COUNTRY])).toEqual(["UK", "US", "US"]);
  });

  it("keeps the level key exactly as given", () => {
    const only = cellsetToRecords(rowsCs, q({ rows: [SECTOR], depth: { [SECTOR]: 2 } }));
    expect(Object.keys(only[0])).toContain(SECTOR);
    expect(Object.keys(only[0])).not.toContain(COUNTRY);
  });
});

describe("cellsetToRecords, rows x cols", () => {
  const query = q({ rows: [MGR, COUNTRY], cols: [UNITS] });
  const recs = cellsetToRecords(rowsColsCs, query);

  it("makes one record per row position and column member, all measures in it", () => {
    expect(recs).toHaveLength(4);
    expect(recs.map((r) => [r[MGR], r[COUNTRY], r[UNITS]])).toEqual([
      ["Mgr One", "UK", "Base"],
      ["Mgr One", "UK", "$"],
      ["Mgr One", "US", "Base"],
      ["Mgr One", "US", "$"],
    ]);
  });

  it("maps ordinal c + r * nCols with two hierarchies on the column axis", () => {
    // cols: 0 VaR/Base, 1 VaR/$, 2 Net/Base, 3 Net/$ ; nCols = 4
    expect(recs[0]["Scenario VaR 99"]).toBe(10);
    expect(recs[0]["Net exposure"]).toBe(30);
    expect(recs[1]["Scenario VaR 99"]).toBe(20);
    expect(recs[1]["Net exposure"]).toBe(40);
    expect(recs[2]["Scenario VaR 99"]).toBe(50);
    expect(recs[2]["Net exposure"]).toBe(70); // ordinal 6 = 2 + 1*4
    expect(recs[3]["Scenario VaR 99"]).toBeNull(); // ordinal 5 is absent
    expect(recs[3]["Net exposure"]).toBe(80);
  });

  it("writes labels and a slicing member path as one name", () => {
    expect(recs[0][`${MGR}#label`]).toBe("Manager One");
    expect(recs[0][`${UNITS}#label`]).toBe("Base");
  });
});

describe("cellsetToRecords, no rows", () => {
  const cs: RawCellSet = {
    axes: [
      {
        id: 0,
        hierarchies: [{ dimension: "Measures", hierarchy: "Measures", levelNames: ["Measures"] }],
        positions: [
          [{ namePath: ["Net exposure"], captionPath: ["Net exposure"] }],
          [{ namePath: ["Scenario VaR 99"], captionPath: ["Scenario VaR 99"] }],
        ],
      },
    ],
    cells: [{ ordinal: 0, value: 5, formattedValue: "5" }],
  };
  it("yields one record of measures; an absent cell is null", () => {
    expect(cellsetToRecords(cs, q({}))).toEqual([{ "Net exposure": 5, "Scenario VaR 99": null }]);
  });
});

describe("cellsetToRecords, errors", () => {
  it("throws on a missing depth", () => {
    expect(() => cellsetToRecords(rowsCs, q({ rows: [COUNTRY, SECTOR], depth: { [COUNTRY]: 1 } }))).toThrow(
      `no depth for ${SECTOR}`,
    );
  });
  it("throws when a q hierarchy is not on the axis", () => {
    expect(() => cellsetToRecords(rowsCs, q({ rows: [MGR], depth: { [MGR]: 1 } }))).toThrow(
      "hierarchy missing from rows axis: [Positions].[Manager]",
    );
  });
  it("throws when the axis has a hierarchy q did not ask for", () => {
    expect(() => cellsetToRecords(rowsCs, q({ rows: [] }))).toThrow(
      "unexpected hierarchy on rows axis: [Securities].[Security]",
    );
  });
  it("throws when a position is shallower than the level depth", () => {
    expect(() => cellsetToRecords(rowsCs, q({ rows: [SECTOR], depth: { [SECTOR]: 3 } }))).toThrow(
      `path too short for ${SECTOR}`,
    );
  });
  it("throws on a measure q did not ask for", () => {
    expect(() => cellsetToRecords(rowsCs, q({ rows: [SECTOR], measures: ["Net exposure"] }))).toThrow(
      "unexpected measure: Scenario VaR 99",
    );
  });
});

describe("toPivotResult", () => {
  const query = q({ rows: [MGR, COUNTRY], cols: [UNITS] });
  const perRowCs: RawCellSet = {
    axes: [
      {
        id: 0,
        hierarchies: [{ dimension: "Measures", hierarchy: "Measures", levelNames: ["Measures"] }],
        positions: [
          [{ namePath: ["Net exposure"], captionPath: ["Net exposure"] }],
          [{ namePath: ["Scenario VaR 99"], captionPath: ["Scenario VaR 99"] }],
        ],
      },
      {
        id: 1,
        hierarchies: rowsColsCs.axes[1].hierarchies,
        positions: rowsColsCs.axes[1].positions,
      },
    ],
    cells: [
      { ordinal: 0, value: 1, formattedValue: "1" },
      { ordinal: 1, value: 2, formattedValue: "2" },
      { ordinal: 2, value: 3, formattedValue: "3" },
      { ordinal: 3, value: 4, formattedValue: "4" },
    ],
  };
  const perColCs: RawCellSet = {
    axes: [rowsColsCs.axes[0]],
    cells: [
      { ordinal: 0, value: 100, formattedValue: "100" },
      { ordinal: 2, value: 300, formattedValue: "300" },
    ],
  };
  const grandCs: RawCellSet = {
    axes: [
      {
        id: 0,
        hierarchies: [{ dimension: "Measures", hierarchy: "Measures", levelNames: ["Measures"] }],
        positions: [
          [{ namePath: ["Net exposure"], captionPath: ["Net exposure"] }],
          [{ namePath: ["Scenario VaR 99"], captionPath: ["Scenario VaR 99"] }],
        ],
      },
    ],
    cells: [
      { ordinal: 0, value: 9, formattedValue: "9" },
      { ordinal: 1, value: 8, formattedValue: "8" },
    ],
  };

  it("fills records only when no totals are given", () => {
    const r = toPivotResult({ body: rowsColsCs }, query);
    expect(r).toMatchObject({ rows: [MGR, COUNTRY], cols: [UNITS], measures: base.measures, totals: false, warning: null });
    expect(r.records).toHaveLength(4);
    expect(r.per_row).toBeUndefined();
    expect(r.per_col).toBeUndefined();
    expect(r.grand).toBeUndefined();
  });

  it("fills per_row, per_col and a single-record grand", () => {
    const r = toPivotResult({ body: rowsColsCs, perRow: perRowCs, perCol: perColCs, grand: grandCs }, query);
    expect(r.totals).toBe(true);
    expect(r.per_row).toEqual([
      { [MGR]: "Mgr One", [`${MGR}#label`]: "Manager One", [COUNTRY]: "UK", [`${COUNTRY}#label`]: "United Kingdom", "Net exposure": 1, "Scenario VaR 99": 2 },
      { [MGR]: "Mgr One", [`${MGR}#label`]: "Manager One", [COUNTRY]: "US", [`${COUNTRY}#label`]: "United States", "Net exposure": 3, "Scenario VaR 99": 4 },
    ]);
    expect(r.per_col).toEqual([
      { [UNITS]: "Base", [`${UNITS}#label`]: "Base", "Scenario VaR 99": 100, "Net exposure": 300 },
      { [UNITS]: "$", [`${UNITS}#label`]: "$", "Scenario VaR 99": null, "Net exposure": null },
    ]);
    expect(r.grand).toEqual({ "Net exposure": 9, "Scenario VaR 99": 8 });
  });
});
