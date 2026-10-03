// barra's pivot safety rules (risk_api.py _validate_pivot, _needs_date_default, the pivot warnings),
// run before any MDX is sent. checkQuery is pure; only useGuardRules touches hooks.
import { useMemo } from "react";
import { useDims, useMeta } from "../api/hooks";
import type { Dims } from "../api/types";
import { parseLevelKey } from "./discovery";
import type { ApQuery } from "./mdx";

// Source: barra_poc python_src/risk_api.py MANAGER_INDEPENDENT_MEASURES.
export const MANAGER_INDEPENDENT = ["Factor contribution", "Specific PnL", "Realized PnL"];

export interface GuardRules {
  scenarioDependent: Set<string>;
  dayDependent: Set<string>;
  priceDependent: Set<string>;
  managerIndependent: Set<string>;
  dollarMeasures: string[];
  multiManager: boolean; // more than one manager LOADED in the cube, not selected
  latestDate: string | null;
}

// Level keys of the context bar fields. DaySet and PriceSet are matched by hierarchy name (see checkQuery).
export interface Bindings {
  manager: string;
  date: string;
  scenarioSet: string;
  units: string;
}

export type GuardResult = { ok: true; q: ApQuery; notice: string | null } | { ok: false; error: string };

export function rulesFromDims(dims: Dims, managers: number): GuardRules {
  return {
    scenarioDependent: new Set(dims.scenario_dependent),
    dayDependent: new Set(dims.day_dependent ?? []),
    priceDependent: new Set(dims.price_dependent ?? []),
    managerIndependent: new Set(MANAGER_INDEPENDENT),
    dollarMeasures: dims.dollar_measures ?? [],
    multiManager: managers > 1,
    latestDate: dims.dates.length > 0 ? dims.dates[dims.dates.length - 1] : null,
  };
}

const hierOf = (key: string): string => {
  const r = parseLevelKey(key);
  return `${r.dim}\u0000${r.hier}`;
};
const hierName = (key: string): string => parseLevelKey(key).hier;

export function checkQuery(q: ApQuery, rules: GuardRules, bind: Bindings): GuardResult {
  const axisKeys = [...q.rows, ...q.cols];
  const onAxis = (match: (k: string) => boolean) => axisKeys.some(match);
  // Members chosen for a hierarchy; an empty list is no filter (buildMdx ignores it too).
  const filterMembers = (match: (k: string) => boolean): string[] =>
    Object.entries(q.filters).filter(([k]) => match(k)).flatMap(([, v]) => v);
  const sameHier = (bound: string) => {
    const h = hierOf(bound);
    return (k: string) => hierOf(k) === h;
  };
  const isMgr = sameHier(bind.manager);
  const isDate = sameHier(bind.date);
  const isScen = sameHier(bind.scenarioSet);
  const isDaySet = (k: string) => hierName(k) === "DaySet";
  const isPriceSet = (k: string) => hierName(k) === "PriceSet";

  const scen = q.measures.some((m) => rules.scenarioDependent.has(m));
  const day = q.measures.some((m) => rules.dayDependent.has(m));
  const price = q.measures.some((m) => rules.priceDependent.has(m));

  // 1. risk_api _validate_pivot: refused on every multi-manager query, filtered or not.
  const unsafe = q.measures.filter((m) => rules.managerIndependent.has(m));
  if (rules.multiManager && unsafe.length > 0) {
    return {
      ok: false,
      error:
        `${JSON.stringify(unsafe)} are manager-independent (baked columns with no Manager key) and cannot be ` +
        "trusted per-manager with more than one manager loaded: they would silently read one arbitrary " +
        "manager's numbers under every manager's label.",
    };
  }

  // 2. risk_api only warns here; a null column is worse than a refusal.
  if (scen && !onAxis(isScen) && filterMembers(isScen).length !== 1) {
    return { ok: false, error: "Scenario measures need one ScenarioSet: pick one scenario set (or put ScenarioSet on an axis)." };
  }

  const notices: string[] = [];
  let out = q;

  // 3. risk_api _needs_date_default: scenario/day/price measure x Manager on an axis x no Date.
  if (
    (scen || day || price) &&
    onAxis(isMgr) &&
    !onAxis(isDate) &&
    filterMembers(isDate).length === 0 &&
    rules.latestDate !== null
  ) {
    const filters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(q.filters)) if (!isDate(k)) filters[k] = v; // drops an empty Date entry
    filters[bind.date] = [rules.latestDate];
    out = { ...q, filters };
    notices.push(
      `No Date in context with scenario measures across managers: that query builds a P&L vector per manager ` +
        `over the whole calendar and can time out. Defaulted to the latest date ${rules.latestDate}; pick a Date to override.`,
    );
  }

  // 4. risk_api's DaySet / PriceSet warnings: context is a filter or an axis.
  if (day && !onAxis(isDaySet) && filterMembers(isDaySet).length === 0) {
    notices.push("Per-day measures read the DaySet hierarchy: pick a single DaySet, otherwise the Day axis stacks every set's days.");
  }
  if (price && !onAxis(isPriceSet) && filterMembers(isPriceSet).length === 0) {
    notices.push("Price measures need a PriceSet context: pick a single PriceSet, otherwise those cells are blank.");
  }

  return { ok: true, q: out, notice: notices.length > 0 ? notices.join(" ") : null };
}

// null until BOTH /dims and /meta have loaded: the caller must not run a pivot unguarded. A /meta with no
// managers list counts as multi-manager (refuse rather than risk wrong numbers).
export function useGuardRules(): GuardRules | null {
  const dims = useDims().data;
  const meta = useMeta().data;
  return useMemo(() => (dims && meta ? rulesFromDims(dims, meta.managers?.length ?? 2) : null), [dims, meta]);
}
