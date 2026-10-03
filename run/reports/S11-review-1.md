Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 4.
- tsc -b 0; vitest 21 files / 188 tests in worktree. pytest and live smoke not re-run. Red supported by test bodies.
- Q1: kept keys restored for rows/cols/measures/filters; unknown ones dropped with one muted line "not in the cube, dropped: …" (tested); model not loaded -> passes through (commented).
- Q2: v1 refusal is one .err small line, no modal; returns before fitToModel/onLoad; v1 and absent schema_version tested.
- Save sends {name, folder, state} PUT /views-api/views/save (tested). v2 round-trip tested, route tests end to end.
- risk_api /views: no non-test caller; views.test asserts none; ^/views-api/ cannot be shadowed.
- Fixture swap Risk HHI -> Scenario VaR 99: nothing weakened. Amendment (client.ts base, v2 fixtures) in scope; default base /api tested.
Advisory: stale header comment in Repository.tsx; saved sort colIds not fitted to the model (harmless if the grid ignores unknown colIds, unverified); push-in-filter idiom terse; pending model passes keys unchecked (commented).
TDD_GATE: PASS
