STEP: S2
GATE:
- `npx tsc -b` -> exit 0.
- `npx vitest run` -> exit 0; 12 files, 51 tests passed (S1 11/42 + 9 new).
- Extra (not a gate condition): `npx vite --port 5175`; GET /ap/activeviam/pivot/rest/v9/cube/discovery -> 200; GET /api/meta -> 200. Dev server stopped.
RED FIRST: src/ap/client.test.ts written before client.ts. `npx vitest run src/ap` failed with a Vite import-resolution error at `import { AP_BASE, ApError, apDiscovery, apMdx } from "./client";` (module absent). "Test Files 1 failed | 1 passed (2)". Assertions: apMdx URL/body/time limit; `data` unwrapping; errorChain -> ApError trimmed; non-JSON 500 -> "HTTP 500"; empty-message guard; abort rejection.
FILES: declared NEW src/ap/client.ts, NEW src/ap/client.test.ts, EXTEND vite.config.ts. Touched exactly those, plus docs/activepivot-ui-plan.md (§9 entries, always permitted). src/api/client.ts untouched.
DISAGREEMENTS:
- vite.config.ts: a bare `/ap` proxy key also prefix-matches `/api/...` (works only because `/api` is first). Used regex key `^/ap/` with rewrite `^/ap/` -> `/`; proxy check confirmed.
- RawDiscovery: §2 live facts name no discovery fields, but the type is required.
DECISIONS THE PLAN LEFT OPEN (also in plan §9):
- Regex proxy key `^/ap/` (independent of key order).
- RawDiscovery is only `{catalogs: {name; cubes: {name}[]}[]}`; S3 widens it. RawCellSet/RawAxis/RawPosition/RawCell carry only the cellset live-fact fields (`hierarchies` is `unknown[]`).
- Error trimming: strip `[NNN] `, then up to the last `: `; if that leaves "", fall back to code-stripped text, then raw. Entries with no message dropped from `chain`. Empty/absent errorChain -> `HTTP <status>`.
- Abort: signal passed to fetch, not caught; AbortError rejects the returned promise (test covers).
MEASUREMENTS: vitest 12 files / 51 tests; 9 new tests; proxy 200/200. No live cell values fetched or recorded.
BUDGET USED: well under 15 min.
NEXT:
- `/ap` proxy key is a regex; new proxies should avoid bare-prefix keys that collide with `/api`.
- S3 must extend RawDiscovery in src/ap/client.ts; that file is S2's, so S3's file set must list it (or S3 types from `unknown`).
- ApError.message is already trimmed; show `chain` only on demand.
