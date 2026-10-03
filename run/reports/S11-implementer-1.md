STEP: S11 — BLOCKED on 5 tests in two files outside the declared set (v1 fixtures); amendment taken by the orchestrator.
GATE:
- `npx tsc -b` -> exit 0.
- `npx vitest run` -> 2 files failed, 19 passed. views.test.ts and Repository.test.tsx pass. Failures: src/routes/Pivot.rejection.test.tsx (1: "surfaces the guard's rejection message and sends no MDX…"), src/routes/Pivot.test.tsx (4: three "loading a saved view" — first click rows, save-form prefill, Fields section — and "a filter the user chose on a context level wins…"). Cause: fixtures HHI_VIEW and REJECTED_VIEW have schema_version 1, which Repository now refuses as required.
- `.venv/bin/python -m pytest -q server/tests` -> 81 passed (S10b staged).
RED FIRST: `npx vitest run src/api/views.test.ts src/pivot/Repository.test.tsx` before implementation: 7 of 10 failed. views.test: "every call goes to /views-api/views" -> `expected [ '/api/views', …(4) ] to deeply equal [ '/views-api/views', …(4) ]`; "no URL starts /api/views" -> `expected [ '/api/views', …(4) ] to deeply equal []`. Repository.test: "lists from /views-api…" -> `expected [ '/api/views', …(1) ] to deeply equal [ '/views-api/views', …(1) ]`; v1 refusal -> `Unable to find an element with the text: saved before ActivePivot fields; not loadable`. Three more (missing-schema_version refusal, unknown-key drop line, save URL) failed, text not captured.
FILES: NEW src/api/views.test.ts, src/pivot/Repository.test.tsx; EXTEND src/api/views.ts, src/api/types.ts, src/pivot/Repository.tsx, vite.config.ts. Declared but untouched: src/routes/Pivot.tsx (currentState already holds what the store keeps). Touched, not declared: src/api/client.ts (optional base the step allows; §9). Needs amendment: src/routes/Pivot.test.tsx, Pivot.rejection.test.tsx (fixtures to schema_version 2). Plan §9.
DISAGREEMENTS:
- v1 refusal loads nothing, but the existing route tests relied on a v1 fixture loading.
- ViewDoc.schema_version typed 2; Repository compares through `as number` in case a fault sends something else.
DECISIONS THE PLAN LEFT OPEN (in §9):
- apiGet/apiSend gain an optional last `base` parameter, default API_BASE.
- Proxy key regex `^/views-api/` rewritten to `/` (mirrors `^/ap/`).
- fitToModel in Repository.tsx: rows/cols/filter keys checked against CubeModel.levels, measures against CubeModel.measures (hidden included); one muted line "not in the cube, dropped: …"; rest loads; no model yet -> passes through.
- schema_version not 2 (incl. absent) refused whole: error line, no onLoad, no save-form prefill.
- Seed's tree emoji (📁) left as is.
MEASUREMENTS: vitest 19/21 files pass, 5 tests fail (v1 fixtures); pytest 81. Live smoke via vite proxy 5175 + store 8020 (scratch DB): GET /views-api/views 200; PUT /views-api/views/save 200 {"file":"Public/Risk/smoke"}; GET /views-api/views/item/Public/Risk/smoke 200, schema_version 2, path Public/Risk, rows/cols/measures round-tripped. Servers stopped (orchestrator confirmed no leftover vite/views_api processes), scratch DB removed.
BUDGET USED: ~25 min, 1 round.
NEXT:
- After the amendment: set schema_version 2 in the two fixtures, re-run the full gate.
- risk_api /views no longer called in src/.
- Route-test fixtures use BINDINGS keys; confirm they survive fitToModel.
- S12 README: views store needs --host 127.0.0.1 and VIEWS_DB; vite proxy reads VIEWS_TARGET.
