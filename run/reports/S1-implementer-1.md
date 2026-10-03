STEP: S1
GATE:
- `npm ci`: exit 0 (npm audit notices only).
- `npx tsc -b`: exit 0.
- `npx vitest run`: exit 0 (re-run, `echo $?` printed VT=0). Output: "Test Files 11 passed (11), Tests 42 passed (42)".
- `npx vite build`: exit 0 ("built in 2.79s"; chunk-size warning only).
- `git ls-files src/routes`: cannot pass before staging. `ls src/routes` gives exactly Pivot.rejection.test.tsx, Pivot.test.tsx and Pivot.tsx. Nothing staged or committed.
RED FIRST: Exempt in substance per the step. Test files copied before source files; order was tests, then sources, then edits. No red state existed.
FILES:
- New files match the declared set: all 40 listed paths. `.gitignore` is modified, not new (it already existed).
- Not copied: node_modules, dist, tsbuildinfo, vite.config.js/.d.ts, deploy.sh, README.md, any other route.
- Differs from barra 442d2bc (diff against `git show`): index.html, package.json, src/App.tsx, src/api/client.ts, src/api/hooks.ts, src/api/types.ts, src/main.tsx, src/shell/LeftRail.tsx, vite.config.ts — exactly the edited files. Every other copied file is byte-identical.
- Also modified, always permitted: docs/activepivot-ui-plan.md (§9 entries), run/tracker.md (orchestrator's).
- No test deleted or weakened. No dependency added, removed or bumped (package.json changed only `name` and `description`).
- No kept file imported anything outside the list; no STOP-AND-REPORT.
DISAGREEMENTS:
- `.gitignore` is in the plan's NEW list but the repo already had one with `tmp/`. Wrote barra's frontend content plus `tmp/`.
- "hooks.ts/types.ts keep only what copied files import": `routes/Pivot.tsx` imports `useWhatif`, so `hooks.ts` keeps `useMeta`, `useDims`, `useWhatif`, `Trade`. `types.ts` keeps 15 exports: Rec, Manager, Meta, ManagerMismatch, Dims, PivotResult, WhatIfRisk, WhatIfResult, ViewLeaf, ViewTree, ViewDoc, PivotQuery, SortItem, ViewState, VegaSpec.
DECISIONS THE PLAN LEFT OPEN (also in plan §9):
1. `.gitignore` keeps `tmp/` alongside barra's content.
2. `vite.config.ts` proxy target `env.RISK_API_URL || "http://127.0.0.1:8010"` (otherwise `env` from the prescribed `loadEnv` is unused); default equals barra's hardcoded target. `x-accel-buffering` hook kept.
3. `useWhatif` and `Trade` kept in `hooks.ts` because Pivot.tsx imports it.
4. Removed the comment line on `basename` from `main.tsx`.
MEASUREMENTS:
- vitest: 11 files, 42 tests passed (`npx vitest run`).
- Pivot route files: 3 (`ls src/routes`).
- types.ts exports: 15 (`grep -n "^export" src/api/types.ts`).
- Files differing from barra: 9.
BUDGET USED: well under 15 min.
NEXT:
- Stage by path, not `-a`.
- tsc -b writes *.tsbuildinfo and vite.config.js/.d.ts; all gitignored, as are node_modules and dist.
- `vite.config.ts` `/api` is the only proxy; S2 extends it with `/ap` (file already in `defineConfig(({ mode }) => {...})` form).
- vite build warns about a chunk over 500 kB (AG Grid, Vega). Not a failure.
