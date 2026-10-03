Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 4.
- tsc -b 0; vitest 16 files / 127 tests. Compared against risk_api.py _validate_pivot, _needs_date_default, warnings, MANAGER_INDEPENDENT_MEASURES.
- Q1: rule 1 matches (spelling identical, fires on every multi-manager query); rule 2 stricter (deliberate); rule 3 matches, slightly stricter (empty Date list = unfiltered); rule 4 matches day_ctx/price_ctx.
- Q2: checkQuery/rulesFromDims pure, input not mutated; malformed key throws (fails closed).
- Q3: useGuardRules null until /dims and /meta load; S7 must treat null as do-not-run.
- Red credible (imports absent ./guards); both directions tested per rule.
Advisory: null latestDate silently skips the date default (rare); S7 should test null GuardRules blocks the fetch; missing managers = multi-manager (fails safe); dollarMeasures/units carried unused (per plan).
Orchestrator check: latest /dims date resolves as an AP Date member (1 cell returned).
TDD_GATE: PASS
