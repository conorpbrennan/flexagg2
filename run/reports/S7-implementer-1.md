STEP: S7 (code complete, unit gate green; live run blocked by S4 member form -> inserted S4c)
GATE:
- `npx tsc -b`: exit 0.
- `npx vitest run`: exit 0, 18 files, 167 tests (baseline 16 / 127).
- `grep -rn '"/pivot"' src/api src/ap src/pivot`: nothing (grep exit 1).
- `grep -rln apMdx src`: only src/ap/client.ts, client.test.ts, pivotSource.ts, pivotSource.test.ts.
- Optional live smoke (:9095, :8010 up), scratch script outside the repo, counts only: with the member form rewritten in flight 5/5 PASS, bindings missing 0 — Factor rows + totals (3 records, grand 1); Units $ (units=dollar, 3 records); col dim + rowTot + totals (24 records, per_row 3, per_col 8, grand 1); Scenario VaR with manager/date/scenario (3 records, grand 2); Manager rows + Scenario VaR, no Date (124 records, warning=yes; guard added latest Date, no retrieval-limit 400). Unrewritten (NOFIX=1): 0/5.
RED FIRST (before any implementation file existed):
- bindings.test.ts: `Failed to resolve import "./bindings" ...`
- pivotSource.test.ts: `Failed to resolve import "./pivotSource" ...`
- usePivot.test.ts, ChartMode.test.tsx (0 tests): `Failed to resolve import "../ap/pivotSource"`. usePivot.test.ts mocks fetchPivotLevel.
- Pivot.test.tsx, Pivot.rejection.test.tsx: both suites failed (0 tests); failure text not captured.
- PivotGrid.test.ts: 4 failed, `labelHeader is not a function` / `valueHeader is not a function`.
- After implementation, own tests fixed twice (answer stub hard-coded one measure; default Units $ expectation).
- Honesty note: one early edit to pivotSource.test.ts by python string-replace; some block deletions in Pivot.tsx and PivotGrid.tsx by sed. Everything else Write/Edit.
FILES: NEW src/ap/bindings.ts, bindings.test.ts, pivotSource.ts, pivotSource.test.ts. EXTEND src/pivot/usePivot.ts, usePivot.test.ts, ChartMode.tsx, ChartMode.test.tsx, PivotGrid.tsx, PivotGrid.test.ts, src/routes/Pivot.tsx, Pivot.test.tsx, Pivot.rejection.test.tsx. Plan §9 (always permitted). Not touched: FieldList.tsx, ContextBar.tsx, mdx.ts, guards.ts, usePivotSort.test.ts (still casts `whatif: [], shocks: {}` as PivotConfig; tsc accepts).
Deleted tests: none. Reworded: rowsFromRecords test ("keys rows by the member path, shows the caption, …"); col-dimension spread test ("(colMember path, measure)"); rejection test ("surfaces the guard's rejection message and sends no MDX…"). No what-if/shocks//analysis tests existed. HypoBar, useWhatif, StreamPanel, hypoParams, whatif/shocks removed from Pivot.tsx and usePivot.ts; StreamPanel.tsx and hooks.ts files stay.
DISAGREEMENTS:
1. src/ap/mdx.ts (S4) vs live AP: memberKey builds `[d].[h].[l].[ALL].[AllMember].[x]`; AP 400s on every filter in that form (Manager, Date, ScenarioSet). Working form `[d].[h].[ALL].[AllMember].[x]`. Slicing short form fine. Probes: level form 400 on 7/7, hierarchy form 200 on 6/6. Not fixed (outside file set); needs S4c. Drill path and sub-select shape not probed. (Orchestrator confirmed live: 400 vs 200.)
2. usePivot call sites: merged into one queryLevel call site; base query carries its margins (no second Total-row call). Margins still cube-computed.
3. PivotGrid captions: no substantive disagreement. Fallback is the level name or last path part; labelHeader/valueHeader exported for testing.
4. "TanStack enabled": usePivot is imperative; reload/toggleExpand return silently on null rules, Pivot.tsx fold effect waits for model and rules. Tests prove no fetch.
DECISIONS THE PLAN LEFT OPEN (in §9):
- fetchPivotLevel args gain slicing and depth, filled by exported makeArgs(model, …).
- Margins: per_col only when totals and a col dim; per_row only when rowTot and a col dim; grand when totals. 4-call case tested; totals alone = 2.
- Units: usePivot adds `[Units].[Units].[Units]: ["$"]` to query filters only, never cfg.filters; fetchPivotLevel reads it for units/dollar_measures.
- mergeFilters: a drill path entry replaces every other filter on its hierarchy (incl. a user filter on another level); that user filter is lost for the drilled subtree.
- Context fold: a Manager/Date/ScenarioSet filter differing from the last folded context value is the user's and wins; Manager now folded; ScenarioSet filter dropped when ScenarioSet on an axis.
- Missing-bindings error line in Pivot.tsx (runs nothing).
- ChartMode takes model and rules; records re-keyed f0..fN (rows, cols, measures), level value = label; old saved specs won't bind until migrated.
- Guard null = silent wait.
MEASUREMENTS: 127/16 -> 167/18. pivotSource 11, bindings 6, usePivot 14, ChartMode 7, PivotGrid 9, Pivot 9, Pivot.rejection 1. Probes 7/7 400 vs 6/6 200.
BUDGET USED: 30 min budget overran (~11 min wall clock, test authoring and mdx investigation).
NEXT:
- Blocker: S4c before S7's live run; rerun smoke with NOFIX=1 (expect 5/5); probe drill (Country then Sector) and a multi-member filter on an axis hierarchy.
- S8: FieldList still lists /dims short names, so adding a field before S8 fails with `bad level key`/`no depth` (shown as the error line); filter chips show bracketed keys. S8 owns both.
- Saved views/charts/`?drill=` links with short names error until migrated.
- usePivot's reload closes over model and rules; Pivot.tsx fold effect deps [dimsQ.data, date, scenario, manager, model, rules].
- Net exposure alone with Manager on rows and no Date is not guarded and will hit AP's retrieval-limit 400 (expected).
