import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/discovery.json";
import type { RawDiscovery } from "./client";
import { toCubeModel } from "./discovery";
import { BINDINGS, DEFAULT_ROWS, checkBindings, contextFilters } from "./bindings";

const model = toCubeModel(fixture as unknown as RawDiscovery);

describe("BINDINGS", () => {
  it("names the four context levels", () => {
    expect(BINDINGS).toEqual({
      manager: "[Positions].[Manager].[Manager]",
      date: "[Exposures].[Date].[Date]",
      scenarioSet: "[Scenarios].[ScenarioSet].[ScenarioSet]",
      units: "[Units].[Units].[Units]",
    });
  });
  it("DEFAULT_ROWS is a level of the fixture cube", () => {
    expect(DEFAULT_ROWS).toEqual(["[FactorMeta].[FactorDim].[FactorGroup]"]);
    expect(model.levels.some((l) => l.key === DEFAULT_ROWS[0])).toBe(true);
  });
});

describe("checkBindings", () => {
  it("finds every bound level in the fixture model", () => {
    expect(checkBindings(model)).toEqual([]);
  });
  it("names the key whose level is missing", () => {
    const noUnits = { ...model, levels: model.levels.filter((l) => l.dim !== "Units") };
    expect(checkBindings(noUnits)).toEqual(["units"]);
  });
});

describe("contextFilters", () => {
  it("turns the context into level-key filters with one-part values", () => {
    expect(contextFilters({ manager: "M1", date: "2026-06-30", scenario: "HistFull" })).toEqual({
      [BINDINGS.manager]: ["M1"],
      [BINDINGS.date]: ["2026-06-30"],
      [BINDINGS.scenarioSet]: ["HistFull"],
    });
  });
  it("drops empty values", () => {
    expect(contextFilters({ manager: "", date: "", scenario: "HistFull" })).toEqual({
      [BINDINGS.scenarioSet]: ["HistFull"],
    });
    expect(contextFilters({ manager: "", date: "", scenario: "" })).toEqual({});
  });
});
