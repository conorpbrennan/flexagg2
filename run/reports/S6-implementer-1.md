STEP: S6
GATE:
- `npx tsc -b` -> exit 0 (first run failed on a typing error in the test's filters literal; fixed, rerun 0)
- `npx vitest run` -> exit 0, 16 files, 127 tests (guards.test.ts: 19)
RED FIRST: `npx vitest run src/ap/guards.test.ts` before implementation: `Error: Failed to resolve import "./guards" from "src/ap/guards.test.ts". Does the file exist?` (Test Files 1 failed, no tests). Cases: per rule firing/not firing, rule 1 beats rule 2, rulesFromDims, empty-Date-filter replace, no mutation, joined notices.
FILES: src/ap/guards.test.ts (new), src/ap/guards.ts (new), src/api/types.ts (price_dependent?, dollar_measures? on Dims). Plan §9 (always permitted). Matches declared set.
DISAGREEMENTS:
- Rule 4 "no DaySet filter": risk_api's day_ctx/price_ctx also accept the set on an axis. Followed risk_api (quiet when on axis).
- Rule 2 errors where risk_api only warns and accepts any fdict entry: followed the step (stricter, deliberate).
- Bindings has no DaySet/PriceSet keys; no signature change needed (see decisions).
- Rule 1 wording: kept risk_api's core text, dropped the barra_poc script pointer.
DECISIONS THE PLAN LEFT OPEN (in §9):
- DaySet/PriceSet matched by hierarchy name via parseLevelKey; Manager/Date/ScenarioSet matched by the bound key's hierarchy (any level of it counts).
- Empty-list Date filter = unfiltered, replaced by the default; latestDate null -> no default.
- useGuardRules returns null until BOTH /dims and /meta load (pivot waits); /meta without `managers` counts as multi-manager (refuse).
- checkQuery returns a new query object; input never mutated.
- MANAGER_INDEPENDENT spelled exactly as risk_api; comment cites risk_api.py MANAGER_INDEPENDENT_MEASURES.
MEASUREMENTS: live risk_api shapes: /dims price_dependent 13, dollar_measures 40, day_dependent 4, scenario_dependent 38; dates 126, ISO YYYY-MM-DD ascending (last = latest, matches risk_api _latest_date max()); /meta managers 123 (multiManager true live). Vitest 16 files / 127 tests.
BUDGET USED: well under 20 min, 1 round.
NEXT:
- S7 treats `useGuardRules() === null` as wait, do not fetch.
- S7 uses the `q` returned by checkQuery (may carry the added Date filter under `bind.date`) and surfaces `notice`.
- dollarMeasures and bind.units are carried, not used by any rule (S7 uses them for Units).
- Date format not verified against AP itself; S7's first live run should confirm the added Date filter returns cells.
- Rule 3 only fires once rule 2 passes; a Manager-axis scenario query without a single ScenarioSet is refused first.
