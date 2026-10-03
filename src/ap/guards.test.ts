import { describe, expect, it } from "vitest";
import { checkQuery, rulesFromDims, MANAGER_INDEPENDENT, type Bindings, type GuardRules } from "./guards";
import type { ApQuery } from "./mdx";
import type { Dims } from "../api/types";

const MGR = "[Positions].[Manager].[Manager]";
const DATE = "[Exposures].[Date].[Date]";
const SCEN = "[Scenarios].[ScenarioSet].[ScenarioSet]";
const UNITS = "[Units].[Units].[Units]";
const DAYSET = "[Scenarios].[DaySet].[DaySet]";
const PRICESET = "[Scenarios].[PriceSet].[PriceSet]";
const COUNTRY = "[Securities].[Security].[Country]";
const BIND: Bindings = { manager: MGR, date: DATE, scenarioSet: SCEN, units: UNITS };

const dims: Dims = {
  dimensions: [],
  measures: [],
  scenario_dependent: ["Scenario VaR 99"],
  day_dependent: ["PnL at day"],
  price_dependent: ["Price VaR"],
  dollar_measures: ["Net exposure"],
  members: {},
  dates: ["2026-04-30", "2026-05-31", "2026-06-30"],
  scenario_sets: [],
};

const rules = (over: Partial<GuardRules> = {}): GuardRules => ({ ...rulesFromDims(dims, 1), ...over });

const q = (over: Partial<ApQuery> = {}): ApQuery => ({
  cube: "Exposures",
  rows: [COUNTRY],
  cols: [],
  measures: ["Net exposure"],
  filters: {},
  nonEmpty: true,
  slicing: [],
  depth: { [COUNTRY]: 1 },
  ...over,
});

describe("rulesFromDims", () => {
  it("builds sets, the constant manager-independent list, latest date and multiManager", () => {
    const r = rulesFromDims(dims, 2);
    expect(r.scenarioDependent.has("Scenario VaR 99")).toBe(true);
    expect(r.dayDependent.has("PnL at day")).toBe(true);
    expect(r.priceDependent.has("Price VaR")).toBe(true);
    expect([...r.managerIndependent].sort()).toEqual(["Factor contribution", "Realized PnL", "Specific PnL"]);
    expect(MANAGER_INDEPENDENT).toEqual(["Factor contribution", "Specific PnL", "Realized PnL"]);
    expect(r.dollarMeasures).toEqual(["Net exposure"]);
    expect(r.latestDate).toBe("2026-06-30");
    expect(r.multiManager).toBe(true);
    expect(rulesFromDims(dims, 1).multiManager).toBe(false);
  });
  it("tolerates absent optional lists and no dates", () => {
    const r = rulesFromDims({ ...dims, day_dependent: undefined, price_dependent: undefined, dollar_measures: undefined, dates: [] }, 0);
    expect(r.dayDependent.size).toBe(0);
    expect(r.priceDependent.size).toBe(0);
    expect(r.dollarMeasures).toEqual([]);
    expect(r.latestDate).toBeNull();
  });
});

describe("rule 1: manager-independent measure on a multi-manager cube", () => {
  it("fires, filtered or not", () => {
    for (const filters of [{} as Record<string, string[]>, { [MGR]: ["A"] }]) {
      const r = checkQuery(q({ measures: ["Specific PnL"], filters }), rules({ multiManager: true }), BIND);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("Specific PnL");
    }
  });
  it("does not fire with one manager, or for another measure", () => {
    expect(checkQuery(q({ measures: ["Specific PnL"] }), rules({ multiManager: false }), BIND).ok).toBe(true);
    expect(checkQuery(q(), rules({ multiManager: true }), BIND).ok).toBe(true);
  });
});

describe("rule 2: scenario-dependent measure needs one ScenarioSet", () => {
  const m = { measures: ["Scenario VaR 99"] };
  it("fires with no ScenarioSet filter, off axis", () => {
    const r = checkQuery(q({ ...m, filters: { [DATE]: ["2026-06-30"] } }), rules(), BIND);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("pick one scenario set") });
  });
  it("fires with two members off axis", () => {
    const r = checkQuery(q({ ...m, filters: { [SCEN]: ["a", "b"] } }), rules(), BIND);
    expect(r.ok).toBe(false);
  });
  it("does not fire with exactly one member, or with ScenarioSet on an axis", () => {
    expect(checkQuery(q({ ...m, filters: { [SCEN]: ["a"] } }), rules(), BIND).ok).toBe(true);
    const onAxis = q({ ...m, cols: [SCEN], depth: { [COUNTRY]: 1, [SCEN]: 1 } });
    expect(checkQuery(onAxis, rules(), BIND).ok).toBe(true);
  });
  it("does not fire for a non-scenario measure", () => {
    expect(checkQuery(q(), rules(), BIND).ok).toBe(true);
  });
});

describe("rule 1 wins over rule 2", () => {
  it("reports the manager-independent error first", () => {
    const r = checkQuery(q({ measures: ["Scenario VaR 99", "Specific PnL"] }), rules({ multiManager: true }), BIND);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Specific PnL");
      expect(r.error).not.toContain("scenario set");
    }
  });
});

describe("rule 3: default the Date when Manager is on an axis", () => {
  const base = { rows: [MGR], depth: { [MGR]: 1 }, measures: ["Scenario VaR 99"], filters: { [SCEN]: ["a"] } };
  it("adds the latest date and says so", () => {
    const r = checkQuery(q(base), rules(), BIND);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.q.filters[DATE]).toEqual(["2026-06-30"]);
      expect(r.q.filters[SCEN]).toEqual(["a"]);
      expect(r.notice).toContain("2026-06-30");
    }
  });
  it("fires for day- and price-dependent measures too", () => {
    for (const measure of ["PnL at day", "Price VaR"]) {
      const r = checkQuery(q({ ...base, measures: [measure] }), rules(), BIND);
      expect(r.ok && r.q.filters[DATE]).toEqual(["2026-06-30"]);
    }
  });
  it("does not mutate the input query", () => {
    const input = q(base);
    checkQuery(input, rules(), BIND);
    expect(input.filters[DATE]).toBeUndefined();
  });
  it("does not fire with Date filtered, Date on an axis, no Manager axis, or an independent measure", () => {
    const filtered = checkQuery(q({ ...base, filters: { ...base.filters, [DATE]: ["2026-05-31"] } }), rules(), BIND);
    expect(filtered.ok && filtered.q.filters[DATE]).toEqual(["2026-05-31"]);
    const onAxis = checkQuery(q({ ...base, cols: [DATE], depth: { ...base.depth, [DATE]: 1 } }), rules(), BIND);
    expect(onAxis.ok && onAxis.q.filters[DATE]).toBeUndefined();
    const noMgr = checkQuery(q({ ...base, rows: [COUNTRY], depth: { [COUNTRY]: 1 } }), rules(), BIND);
    expect(noMgr.ok && noMgr.q.filters[DATE]).toBeUndefined();
    const plain = checkQuery(q({ rows: [MGR], depth: { [MGR]: 1 } }), rules(), BIND);
    expect(plain.ok && plain.q.filters[DATE]).toBeUndefined();
  });
  it("treats an empty Date filter as unfiltered and replaces it", () => {
    const r = checkQuery(q({ ...base, filters: { ...base.filters, [DATE]: [] } }), rules(), BIND);
    expect(r.ok && r.q.filters[DATE]).toEqual(["2026-06-30"]);
  });
  it("does not add a date when none is known", () => {
    const r = checkQuery(q(base), rules({ latestDate: null }), BIND);
    expect(r.ok && r.q.filters[DATE]).toBeUndefined();
  });
});

describe("rule 4: DaySet / PriceSet context notices", () => {
  it("notices a day-dependent measure with no DaySet filter", () => {
    const r = checkQuery(q({ measures: ["PnL at day"] }), rules(), BIND);
    expect(r.ok && r.notice).toContain("DaySet");
  });
  it("notices a price-dependent measure with no PriceSet filter", () => {
    const r = checkQuery(q({ measures: ["Price VaR"] }), rules(), BIND);
    expect(r.ok && r.notice).toContain("PriceSet");
  });
  it("is silent with a DaySet / PriceSet filter, or on an axis, or for other measures", () => {
    const d = checkQuery(q({ measures: ["PnL at day"], filters: { [DAYSET]: ["x"] } }), rules(), BIND);
    expect(d.ok && d.notice).toBeNull();
    const p = checkQuery(q({ measures: ["Price VaR"], filters: { [PRICESET]: ["x"] } }), rules(), BIND);
    expect(p.ok && p.notice).toBeNull();
    const ax = checkQuery(q({ measures: ["PnL at day"], cols: [DAYSET], depth: { [COUNTRY]: 1, [DAYSET]: 1 } }), rules(), BIND);
    expect(ax.ok && ax.notice).toBeNull();
    expect((checkQuery(q(), rules(), BIND) as { notice: string | null }).notice).toBeNull();
  });
  it("joins the rule 3 and rule 4 notices", () => {
    const r = checkQuery(
      q({ rows: [MGR], depth: { [MGR]: 1 }, measures: ["PnL at day"] }),
      rules(),
      BIND,
    );
    expect(r.ok && r.notice).toContain("2026-06-30");
    expect(r.ok && r.notice).toContain("DaySet");
  });
});
