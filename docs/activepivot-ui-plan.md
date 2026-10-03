# Plan — flexagg2++: a React/Vite pivot explorer on native ActivePivot

Status: DRAFT, revision 1 (2026-10-03). Branch `activepivot-explorer`.
Built from barra_poc's Vite UI (barra_poc `frontend/` at sha 442d2bc), not the Streamlit app.

## 1. What this delivers, and what it does not

**Delivers.** A standalone Vite + React + TS app in this repo that:

- reads the cube's shape from ActivePivot itself (discovery REST), not from a hand-kept allowlist;
- runs every pivot as **MDX against ActivePivot** (`/activeviam/pivot/rest/v9/cube/query/mdx`) and renders
  the cellset in the existing Tufte AG Grid, with the existing lazy server drill;
- keeps barra's safety rules (single ScenarioSet for scenario measures, the manager-independent trio, the
  missing-Date default) as client-side guards, fed by risk_api's `/dims`, plus a per-query
  `queriesTimeLimit`;
- keeps the global context bar (manager / as-of date / scenario set), still fed by risk_api `/meta`;
- saves views in **its own store**: a small FastAPI + SQLite service in `server/`, owned by this repo.

**Hybrid, concretely.** Grid numbers come from ActivePivot. risk_api is used for two read-only calls
(`/meta`, `/dims`) and nothing else in this plan. The barra lenses (Overview, Trends, Stress, What-if,
LLM panels…) are a second plan, and they will keep calling risk_api.

**Does not deliver.**

- No barra lens other than the pivot workspace (and its chart mode). No what-if / stress branches in the
  grid (those are risk_api-only today; second plan). No `/analysis` LLM panel.
- No production serving. Dev only (`npm run dev` + proxies). The nginx snippet is documented, not applied.
  `/etc` is not touched.
- No import of barra_poc's existing saved views (they name risk_api fields, not ActivePivot levels).
- No change to barra_poc, the cube, or risk_api.
- No auth. ActivePivot on :9095 answers anonymously with ROLE_ADMIN and listens on all interfaces; this
  plan reaches it only through the dev proxy and flags it in §9 rather than fixing it.
- No websocket / real-time push. The cube is static between rebuilds.

## 2. Working constraints — apply to every step

**Repo and commit.**

- Work on branch `activepivot-explorer`. Never commit source on `main`.
- Stage and commit as two separate Bash commands: `git add <paths>`, then `git commit -m "<msg>"` on its
  own. No `&&` chains, no `-a`, no path after `-m`, no commit from a script.
- The commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every commit runs the pre-commit review hook. Expect the first attempt to block; the block message
  carries the marker command. Run it verbatim only after a reviewer PASS.
- TDD mandate: the test file is edited **before** the implementation file, in this session, and both are
  in the same commit. `.ts`/`.tsx`/`.py` are code; `.json`, `.md`, `.css`, `.html` are not.

**Harness facts.**

- Gates read every Bash command, a sub-agent's included. Write files with the Write/Edit tools, not
  heredocs. Keep `$(` out of any command that also names `git commit`.
- A sub-agent's cwd resets between commands. Every command starts `cd /home/abrennan/dev/flexagg2++ && …`
  or uses absolute paths.
- Apply multi-anchor edits to documents with `edit_doc.py` (the plan-spec skill's base directory),
  never a read-substitute-write loop.

**Always permitted, never counted in a file set:** this plan, `features/activepivot-explorer.md`, the
tracker `run/tracker.md`, and `run/reports/`.

**Checks every step's GATE includes** (the suite has no class-level guard tests; these are the whole
standing set):

- `cd /home/abrennan/dev/flexagg2++ && npx tsc -b` exits 0
- `cd /home/abrennan/dev/flexagg2++ && npx vitest run` exits 0
- from S9 on, also `cd /home/abrennan/dev/flexagg2++ && .venv/bin/python -m pytest -q server/tests` exits 0

**Single owners** — import, never reimplement:

| Thing | Owner |
|---|---|
| HTTP to risk_api (`/meta`, `/dims`) | `src/api/client.ts` (`apiGet`) |
| HTTP to ActivePivot | `src/ap/client.ts` (S2) |
| Cube model from discovery | `src/ap/discovery.ts` (S3) |
| Pivot query → MDX text | `src/ap/mdx.ts` (S4) |
| Cellset → `PivotResult` | `src/ap/cellset.ts` (S5) |
| Safety rules | `src/ap/guards.ts` (S6) |
| One pivot level fetch (guards + MDX + adapter) | `src/ap/pivotSource.ts` (S7) |
| Context bar field → level | `src/ap/bindings.ts` (S8) |
| Number formatting / RAG colours | `src/lib/format.ts` |
| Saved-view storage | `server/views_store.py` (S10) |

Found by reading the seed: `client.ts` is the only `fetch` wrapper, `format.ts` the only formatter, and
`usePivot.ts` the only place a `/pivot` call is built.

**Live facts (probed 2026-10-03; quote them, do not re-derive).**

- ActivePivot 6.1.20 (Atoti 0.9.15) on `127.0.0.1:9095`. REST `activeviam/pivot/rest/v9`. One catalog
  `atoti`, one cube `Exposures`: 17 hierarchies, 175 measures, 86 visible.
- Hierarchies the context bar needs: `[Positions].[Manager].[Manager]`, `[Exposures].[Date].[Date]`,
  `[Scenarios].[ScenarioSet].[ScenarioSet]`, `[Units].[Units].[Units]` (slicing, members `$`/`Base`).
- MDX POST body `{"mdx": "...", "context": {"queriesTimeLimit": "30"}}` is accepted. Errors come back as
  HTTP 400 with `{"errorChain":[{"type","message"}], "stackTrace"}`.
- Cellset: `axes[]` with `id` 0 (columns), 1 (rows), -1 (slicer), each with `hierarchies[]` and
  `positions[][]` of `{namePath, captionPath}`; `cells[]` sparse by `ordinal`, each `{ordinal, value,
  formattedValue}`. Ordinal = col + row × nCols.
- Measure names in the cube equal risk_api's measure names (`Scenario VaR 99`, `Net exposure`,
  `Manager MV`… all present).

**Tufte & Few** (user's global rule). The seed's `src/index.css` carries the palette (grey + one accent,
RAG only for status), hairline tables, tabular numerals. No step adds colour, borders, cards or icons
that do not encode data.

**Implementer tier:** Sonnet. **Reviewer:** `sdlc:code-reviewer`; `sdlc:code-reviewer-deep` for S4
(it builds query text from user-picked names, so escaping is the risk) and S10 (path handling).

**No client data.** Reports and the tracker say counts and shapes, never manager names or holdings.
Fixtures may hold cube *structure* (hierarchy and measure names) but no cell values from a real query;
cell values in fixtures are made up.

## 3. Owner decisions

| # | Decision | Answer (2026-10-03) | Blocks |
|---|---|---|---|
| D1 | How the UI reaches the cube | **Hybrid.** Pivot via native ActivePivot REST; context bar and rules via risk_api; later lenses keep risk_api | S2–S8 |
| D2 | First plan's scope | **Pivot explorer first.** Lenses are a second plan | §1 |
| D3 | Where saved views live | **Own store.** First answered "content server", then changed by the owner the same day. The content server was also found to be in-memory (no `user_content_storage` in barra_poc's `build_cube`), so it would lose views on every cube restart | S9–S11 |
| D4 | Plan review loop cap | **3 rounds** | §8 |
| D5 | Run authority | **Unattended.** Once the plan is READY, the orchestrator may stage, attempt commits, run the marker command after a PASS, and dispatch fix implementers without asking per step. This overrides the default "commit only when the user asks" and "wait for the user after the marker". Two FAILs on one step still stop the run | every step |
| D6 | Named-reader steps | S12 only (README/serving doc). The owner reads it at the end | S12 |

**Defaults taken without asking (owner may overturn before dispatch):**

- Base path stays `/flexagg2++/`, set from env `VITE_BASE`. barra_poc's Vite UI is already served there,
  so a production deploy must pick one. This only matters at deploy, which is out of scope.
- Dev port 5174 (barra_poc's dev server holds 5173). Views service on `127.0.0.1:8020`.
- Views store: FastAPI + SQLite (`data/views.db`, gitignored), its own `.venv`. That's the house stack,
  and SQLite means moves and renames are transactions, not file juggling.

## 4. Prerequisites and ordering

**Before S1** (orchestrator, done while preparing the plan): `git init` in this directory, branch
`activepivot-explorer`, this plan committed (docs only, not gated), feature file seeded with
`/sdlc:feature-new activepivot-explorer "A React/Vite pivot explorer that queries ActivePivot natively
(discovery + MDX) and saves views in its own store."`

**Running services needed by live checks:** ActivePivot on :9095 and risk_api on :8010 (both up on
2026-10-03). Steps never require them for their GATE: the GATEs run against fixtures. S7 and S8 each add
one optional live smoke check, which is reported and does not block.

**Order.** S1 seed → S2 transport → S3 discovery → S4 MDX → S5 cellset → S6 guards → S7 wire the pivot
→ S8 context bindings + field list → S9 views server → S10 views API → S11 Repository on the new store →
S12 docs. S2–S6 are pure modules with disjoint files; S7 is the first step that changes behaviour. S9 and
S10 touch only `server/`, so they could overlap S7–S8 under §7a, but run them in order: one implementer
at a time.

**Target.** No frozen output to match. What plays that role: the seed's 63 passing tests (15 files) at S1,
and the fixture-driven suites S3–S6 add. Behaviour that must survive is pinned by the seed's existing
`usePivot`, `PivotGrid`, `ChartMode` and `Pivot` tests, which S7 changes only where the transport changes.

**Suite baseline.** At barra_poc 442d2bc: `npx vitest run` → 15 files, 63 tests, all passing. Nothing red
at the start. S1's GATE re-measures it here after the trim.

## 5. The steps

**S1. This repo holds a working, trimmed copy of barra_poc's Vite UI with only the pivot workspace.**
NEW `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `tsconfig.node.json`,
`vite.config.ts`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`,
`src/api/client.ts`, `src/api/hooks.ts`, `src/api/types.ts`, `src/api/views.ts`, `src/api/stream.ts`,
`src/api/stream.test.ts`, `src/components/svg.tsx`, `src/components/svg.test.tsx`, `src/components/ui.tsx`,
`src/components/ui.test.tsx`, `src/components/Markdown.tsx`, `src/components/StreamPanel.tsx`,
`src/components/LineChart.tsx`, `src/context/AppContext.tsx`, `src/lib/format.ts`,
`src/lib/format.test.ts`, `src/shell/ContextBar.tsx`, `src/shell/ContextBar.test.tsx`,
`src/shell/LeftRail.tsx`, `src/pivot/usePivot.ts`, `src/pivot/usePivot.test.ts`,
`src/pivot/usePivotSort.test.ts`, `src/pivot/FieldList.tsx`, `src/pivot/PivotGrid.tsx`,
`src/pivot/PivotGrid.test.ts`, `src/pivot/ChartMode.tsx`, `src/pivot/ChartMode.test.tsx`,
`src/pivot/Repository.tsx`, `src/routes/Pivot.tsx`, `src/routes/Pivot.test.tsx`,
`src/routes/Pivot.rejection.test.tsx`.

WHY NOW: everything after builds on this. Copying (not rewriting) keeps the Tufte grid, drill and chart
mode that already pass 63 tests.

WHAT TO BUILD:
- Copy the listed files byte-for-byte from barra_poc `frontend/` (same relative paths). Do not copy
  `node_modules`, `dist`, `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`, `deploy.sh`, `README.md`,
  `src/routes/Attribution.tsx.tmp.*`, or any other route.
- Then the only edits: `App.tsx` routes `/` → `<Navigate to="/pivot">`, `/pivot` → Pivot, `*` → `/pivot`;
  remove the other route imports. `LeftRail.tsx` keeps only the Pivot entry. `package.json` `name` →
  `flexagg2pp-ap-explorer`, `description` → one line saying it is the ActivePivot explorer.
  `vite.config.ts`: `base: process.env.VITE_BASE ?? "/flexagg2++/"`, dev `port: 5174`.
- `hooks.ts` keeps only the hooks that the copied files import; delete the rest. `types.ts` likewise.
  Deleting is the only change to them.
- If a kept file imports something not on the list, STOP-AND-REPORT; do not copy more.

IMPORTS: none new.
ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/ap/` (S2–S8), `server/` (S9–S10).
TESTS FIRST: exempt in substance (a copy with its own tests). Copy the test files before the source files
so the edit order holds.
GATE: `npm ci` exits 0 and `npx tsc -b` exits 0 and `npx vitest run` exits 0 and `npx vite build` exits 0
and `git ls-files src/routes` lists exactly `Pivot.tsx`, `Pivot.test.tsx`, `Pivot.rejection.test.tsx`.
REVIEW:
1. Does any copied file differ from barra_poc at 442d2bc beyond the edits listed in WHAT TO BUILD?
   (`diff` each against `git -C /home/abrennan/dev/barra_poc show 442d2bc:frontend/<path>`.)
2. Did a test get deleted or weakened to make the suite pass?
3. Is any dependency in `package.json` added, removed or bumped?
FAIL if: any answer is yes, or a non-listed file is committed.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 15 min (`npm ci` ~2 min); 1 review round. The diff is large but mechanical; the reviewer diffs,
it does not read.

**S2. The app can call ActivePivot's REST API through a same-origin dev proxy.**
NEW `src/ap/client.ts`, `src/ap/client.test.ts`. EXTEND `vite.config.ts`.

WHAT TO BUILD:
- `AP_BASE = (import.meta.env.BASE_URL ?? "/flexagg2++/") + "ap"`; REST root
  `${AP_BASE}/activeviam/pivot/rest/v9`.
- `class ApError extends Error { status: number; chain: string[] }`, message = first `errorChain` message
  with the leading `[400] ` and any Java class prefix up to the last `: ` removed; `chain` keeps them all.
  Non-JSON error body → message `HTTP <status>`.
- `apDiscovery(): Promise<RawDiscovery>` = GET `/cube/discovery`, unwraps `data` if present.
- `apMdx(mdx: string, opts?: {timeLimitS?: number; signal?: AbortSignal}): Promise<RawCellSet>` = POST
  `/cube/query/mdx` body `{mdx, context: {queriesTimeLimit: String(timeLimitS ?? 30)}}`, unwraps `data`.
- `RawDiscovery`, `RawCellSet` types: exactly the fields in §2 "Live facts", nothing speculative.
- `vite.config.ts`: add proxy `${base}ap` → `process.env.AP_TARGET ?? "http://127.0.0.1:9095"`, prefix
  stripped, `changeOrigin: true`. The existing `/api` proxy is unchanged.
IMPORTS: none (this is the owner).
ASSUMES LANDED: S1.
MUST NOT TOUCH: `src/api/client.ts` (risk_api's owner, stays as is).
TESTS FIRST: `src/ap/client.test.ts` with mocked `fetch`: URL and body of `apMdx` include the time limit;
`data` unwrapping; an `errorChain` body becomes `ApError` with the trimmed message; a non-JSON 500 becomes
`HTTP 500`. Red because `src/ap/client.ts` does not exist.
GATE: §2 standard checks.
REVIEW:
1. Is the proxy prefix built from the same base as the app (so a changed `VITE_BASE` moves both)?
2. Can an aborted request surface as an unhandled rejection?
3. Does the error trimming ever drop the whole message (empty string)?
FAIL if: any `fetch` outside `src/ap/client.ts` targets ActivePivot; a type field not in §2's live facts.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 15 min; 1 round.

**S3. The cube's shape is available as a typed model built from discovery.**
NEW `src/ap/discovery.ts`, `src/ap/discovery.test.ts`, `src/ap/__fixtures__/discovery.json`.

WHAT TO BUILD:
- Fixture: the live discovery response, trimmed to the `Exposures` cube with every dimension/hierarchy/level
  kept and measures cut to about 15 (include `contributors.COUNT`, `Net exposure`, `Scenario VaR 99`,
  `Total VaR 99`, `Manager MV`, `Factor contribution`, and at least two with `visible: false`).
  Discovery holds names only, no cell values, so it passes the §2 data rule.
- `interface LevelRef { dim: string; hier: string; level: string }`, `levelKey(r) = "[d].[h].[l]"` with
  `]` escaped as `]]` inside each part, and `parseLevelKey` as its exact inverse.
- `interface CubeModel { cube: string; levels: LevelInfo[]; measures: MeasureInfo[]; slicing: string[] }`.
  `LevelInfo = LevelRef & { key; caption; depth; slicing: boolean }`. Leaves out `ALL` levels and the
  `Epoch` dimension. `MeasureInfo = { name; caption; formatString; visible }`.
- `toCubeModel(raw: RawDiscovery, cube = "Exposures"): CubeModel`. If the cube is not found, throw
  `Error("cube <name> not in discovery")`.
- `useCubeModel()`: TanStack Query, key `["ap","discovery"]`, `staleTime: Infinity`.
IMPORTS: `src/ap/client.ts` (`apDiscovery`, `RawDiscovery`).
ASSUMES LANDED: S2.
MUST NOT TOUCH: `src/ap/mdx.ts` (S4) — `levelKey` lives here and S4 imports it.
TESTS FIRST: `discovery.test.ts` against the fixture: Securities yields 4 levels in order
Country→Sector→Issuer→Position, depth 1..4; no `ALL` level; `Units` is slicing; `levelKey`/
`parseLevelKey` round-trip a name holding `]`; unknown cube throws. Red: module absent.
GATE: §2 standard checks and `node -e "JSON.parse(require('fs').readFileSync('src/ap/__fixtures__/discovery.json'))"` exits 0.
REVIEW:
1. Does the fixture hold any number that came from a cell (it must not)?
2. Is `levelKey` the only place the bracket form is built?
3. Are hidden measures kept in the model (the field list decides what to show, not this module)?
FAIL if: the model drops a non-`ALL` level, or the escaping is not round-trip safe.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 20 min; 1 round.

**S4. A pivot request becomes MDX text by one pure function.**
NEW `src/ap/mdx.ts`, `src/ap/mdx.test.ts`.

WHAT TO BUILD:
- `interface ApQuery { cube: string; rows: string[]; cols: string[]; measures: string[];
  filters: Record<string, string[]>; nonEmpty: boolean }`. Row/col/filter keys are level keys (S3).
- `memberKey(levelKey, name) = levelKey + ".[" + esc(name) + "]"` and `measureKey(name)` =
  `[Measures].[esc(name)]`, `esc` doubling `]`.
- `buildMdx(q): string`:
  - COLUMNS = `{measures}` crossed with `cols` level members if `cols` is non-empty.
    ROWS = crossjoin of `<level>.Members` for each row level; omitted when `rows` is empty (grand total).
    `NON EMPTY` on both axes when `q.nonEmpty`.
  - Filters: a level with one member goes into `WHERE` as a tuple. A level with several members becomes a
    sub-select, `FROM (SELECT {m1, m2} ON COLUMNS FROM [cube])`, nested once per such level.
    Never both a WHERE and a sub-select on the same hierarchy.
  - Empty `measures` → throw `Error("select at least one measure")`.
- No string from the user reaches the output except through `esc`.
IMPORTS: `src/ap/discovery.ts` (`levelKey`, `parseLevelKey`).
ASSUMES LANDED: S3.
MUST NOT TOUCH: `src/ap/cellset.ts` (S5).
TESTS FIRST: `mdx.test.ts`: exact strings for (a) one row level + two measures, (b) two row levels
(crossjoin), (c) one col level, (d) single-member filter → WHERE, (e) two-member filter → sub-select,
(f) a member named `a]b` comes out as `[a]]b]`, (g) no rows → no ROWS axis, (h) empty measures throws.
Red: module absent.
GATE: §2 standard checks.
REVIEW (deep tier):
1. Try to break the escaping: names holding `]`, `[`, `.`, `'`, newline. Does any let the
   name close the bracket early?
2. Is the axis order (rows, then cols) the one S5 assumes when it rebuilds records?
3. Two filters on levels of the *same* hierarchy: is the output valid MDX or an explicit error?
FAIL if: any user string reaches the output unescaped; a test asserts a substring where the step asks for
exact strings.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 25 min; 1–2 rounds (deep review).

**S5. An MDX cellset becomes the `PivotResult` shape the grid already renders.**
NEW `src/ap/cellset.ts`, `src/ap/cellset.test.ts`, `src/ap/__fixtures__/cellset-rows.json`,
`src/ap/__fixtures__/cellset-rows-cols.json`.

WHAT TO BUILD:
- `cellsetToRecords(cs: RawCellSet, q: ApQuery): Rec[]`: one record per (row position × col position),
  with keys = the risk-style short level name (`level`, e.g. `Factor`) for each row/col level, plus one
  key per measure name. Member value = last `captionPath` entry. Missing ordinal → `null`.
  Column count = `axes[id 0].positions.length`.
- `toPivotResult(parts: {body: RawCellSet; perRow?: RawCellSet; perCol?: RawCellSet; grand?: RawCellSet},
  q): PivotResult` fills `records`, `per_row`, `per_col`, `grand` exactly as `src/api/types.ts`
  `PivotResult` defines them. `warning: null` (S6 owns warnings).
- If two levels in one query share a short name, prefix with the hierarchy (`Date` vs `ScenarioDays.Day`);
  test it.
- Fixtures are hand-written in the live shape (§2), with made-up values.
IMPORTS: `src/ap/client.ts` (`RawCellSet`), `src/ap/mdx.ts` (`ApQuery`), `src/api/types.ts`
(`PivotResult`, `Rec`).
ASSUMES LANDED: S4.
MUST NOT TOUCH: `src/pivot/usePivot.ts` (S7).
TESTS FIRST: `cellset.test.ts`: rows-only fixture gives the right records; rows×cols fixture maps ordinal
`c + r*nCols` correctly; a sparse cell is `null`; short-name collision is prefixed; `grand` is a single
record of measures. Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Is there any sum, average, or fill of a missing value? (VaR is non-additive: there must be none.)
2. Does the ordinal arithmetic hold when the column axis has more than one hierarchy?
3. Do the record keys match what `PivotGrid.tsx` and `ChartMode.tsx` read, without changing either?
FAIL if: any arithmetic on cell values; a change to `src/api/types.ts`.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 25 min; 1 round.

**S6. barra's pivot safety rules run in the browser before any MDX is sent.**
NEW `src/ap/guards.ts`, `src/ap/guards.test.ts`. EXTEND `src/api/types.ts` (add
`price_dependent?: string[]` to `Dims`; risk_api already returns it).

WHAT TO BUILD:
- `interface GuardRules { scenarioDependent: Set<string>; dayDependent: Set<string>;
  priceDependent: Set<string>; managerIndependent: Set<string>; multiManager: boolean;
  latestDate: string | null }`.
- `rulesFromDims(dims: Dims, managers: number): GuardRules`. Lists come from risk_api `/dims`
  (`scenario_dependent`, `day_dependent`, `price_dependent`). `managerIndependent` is the constant
  `["Factor contribution","Specific PnL","Realized PnL"]`, with a comment naming barra_poc
  `risk_api.py` `MANAGER_INDEPENDENT_MEASURES` as its source. `latestDate` = last of `dims.dates`.
- `checkQuery(q: ApQuery, rules, bind: Bindings): {ok: true; q: ApQuery; notice: string | null} |
  {ok: false; error: string}`. Rules, in order:
  1. a manager-independent measure with `multiManager` → error (same wording idea as risk_api's 400);
  2. a scenario-dependent measure and the ScenarioSet level not filtered to exactly one member and not on
     an axis → error "pick one scenario set";
  3. a scenario/day/price-dependent measure, Manager on an axis, Date neither on an axis nor filtered →
     add the `latestDate` filter, `notice` says so (risk_api's 60 s pathology).
- `Bindings` is a stub type here (`{manager; date; scenarioSet; units}` level keys); S8 owns real values.
  The test passes literal keys.
- `useGuardRules()` hook reading `useDims` + `useMeta` from `src/api/hooks.ts`.
IMPORTS: `src/api/hooks.ts` (`useDims`, `useMeta`), `src/api/types.ts` (`Dims`), `src/ap/mdx.ts` (`ApQuery`).
ASSUMES LANDED: S4.
MUST NOT TOUCH: `src/ap/bindings.ts` (S8).
TESTS FIRST: `guards.test.ts`: one case per rule firing, one per rule not firing, and rule order (1 wins
over 2). Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Does each rule match its risk_api counterpart (`_validate_pivot`, the ScenarioSet `warning`,
   `_needs_date_default`)? Read barra_poc `python_src/risk_api.py` to answer.
2. Is the guard pure (no fetch, no hook) apart from `useGuardRules`?
3. When `/dims` has not loaded, does the pivot wait, or run unguarded? It must wait.
FAIL if: a rule is weaker than its risk_api counterpart; the list of three measures is spelled
differently from risk_api's.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 20 min; 1 round.

**S7. The pivot grid and chart mode run on ActivePivot instead of risk_api `/pivot`.**
NEW `src/ap/pivotSource.ts`, `src/ap/pivotSource.test.ts`. EXTEND `src/pivot/usePivot.ts`,
`src/pivot/usePivot.test.ts`, `src/pivot/ChartMode.tsx`, `src/pivot/ChartMode.test.tsx`,
`src/routes/Pivot.test.tsx`, `src/routes/Pivot.rejection.test.tsx`.

WHAT TO BUILD:
- `fetchPivotLevel(args: {cube; rows; cols; measures; filters; totals; rowTot}, rules, bind,
  signal?): Promise<PivotResult>`: `checkQuery` → if not ok, throw `ApError(400, error)` so the existing
  rejection UI shows it. Then one MDX for the body, and when totals are asked, separate MDX for `per_row`
  (rows only), `per_col` (cols only) and `grand` (no rows), in parallel. Notice → `PivotResult.warning`.
- `usePivot.ts` `queryLevel` calls `fetchPivotLevel` instead of `apiGet("/pivot")`. Drill, sort, hide-empty,
  splice and every other behaviour stay as they are. Row/col/filter values are now level keys.
- Units: `cfg.units === "dollar"` becomes a filter `[Units].[Units].[Units]` = `$`; `weight` adds nothing.
- Remove the `whatif`/`shocks` fields from `PivotConfig` and `hypoParams` (§1: not in this plan).
  Delete only the tests that exercise them. Name each deleted test in the report.
- `ChartMode.tsx` fetches each named query through `fetchPivotLevel` with no drill.
IMPORTS: `src/ap/pivotSource.ts` imports `src/ap/client.ts`, `src/ap/mdx.ts`, `src/ap/cellset.ts`,
`src/ap/guards.ts`. Nothing else may call `apMdx`.
ASSUMES LANDED: S5, S6.
MUST NOT TOUCH: `src/pivot/FieldList.tsx`, `src/routes/Pivot.tsx`, `src/shell/ContextBar.tsx` (S8).
TESTS FIRST: `pivotSource.test.ts` (mock `apMdx`): guard error → `ApError` 400 with no MDX sent; totals
issue 4 MDX calls, no totals issue 1; a notice ends up in `warning`. Then update `usePivot.test.ts` so its
mock is `fetchPivotLevel`, not `apiGet`. Red: `pivotSource.ts` absent, and `usePivot.test.ts` expects
the new mock.
GATE: §2 standard checks and `grep -rn '"/pivot"' src` prints nothing.
Optional live smoke (report the result, it does not block): with :9095 up, `npx vite` and load
`/flexagg2++/pivot`, rows Factor level, measure Net exposure, one manager + date; the grid fills.
REVIEW:
1. Are the margins still cube-computed, separate queries? Is any total summed in the browser?
2. Do the drill tests still prove expand → one query for the next level, filtered to the parent path?
3. Is each test deletion only for the removed what-if/shocks path?
FAIL if: a client-side sum; a test deleted that is not about what-if/shocks; `apMdx` called outside
`pivotSource.ts`.
ROLLBACK: a single `git revert` of this step's commit. S8 depends on it; revert S8 first.
BUDGET: 30 min; 1–2 rounds. The biggest behaviour change in the plan.

**S8. The context bar and the field list speak ActivePivot levels.**
NEW `src/ap/bindings.ts`, `src/ap/bindings.test.ts`, `src/pivot/FieldList.test.tsx`. EXTEND
`src/pivot/FieldList.tsx`, `src/routes/Pivot.tsx`, `src/routes/Pivot.test.tsx`.

WHAT TO BUILD:
- `bindings.ts`: `BINDINGS = { manager: "[Positions].[Manager].[Manager]", date: "[Exposures].[Date].[Date]",
  scenarioSet: "[Scenarios].[ScenarioSet].[ScenarioSet]", units: "[Units].[Units].[Units]" }`.
  `checkBindings(model: CubeModel): string[]` returns the keys missing from the model.
  `contextFilters(ctx: {manager; date; set}): Record<string,string[]>` turns the global context into
  level-key filters. A context value that is empty adds nothing.
- `Pivot.tsx`: the merged filters are `contextFilters(ctx)` overlaid by the user's own filters (user wins
  on the same level). If `checkBindings` is non-empty, show one line naming the missing levels; the
  pivot still works without the context.
- `FieldList.tsx`: sources come from `useCubeModel()`. Dimensions grouped by dimension → hierarchy →
  levels in depth order, captions shown. Measures: visible only, alphabetical, with a text filter box.
  Drag and drop zones are unchanged. Field ids are level keys.
- The context bar itself (`ContextBar.tsx`) is unchanged: it still reads risk_api `/meta`.
IMPORTS: `src/ap/discovery.ts` (`useCubeModel`, `CubeModel`), `src/ap/guards.ts` (`Bindings` type now
filled from here).
ASSUMES LANDED: S7.
MUST NOT TOUCH: `src/shell/ContextBar.tsx`, `src/context/AppContext.tsx`, `server/`.
TESTS FIRST: `bindings.test.ts`: `checkBindings` against the S3 fixture returns `[]`, and against a copy
missing Units returns `["units"]`; `contextFilters` drops empties. `FieldList.test.tsx`: renders the
fixture's Securities levels in order; hidden measures absent; the text filter narrows the list. Red:
modules absent.
GATE: §2 standard checks.
Optional live smoke (reported, not blocking): the field list shows 86 measures on the live cube.
REVIEW:
1. Does a user filter on Manager override the context bar's manager, as WHAT TO BUILD says?
2. With 86 measures, is the list usable without scrolling past chrome (filter box first, Tufte: no
   icons, no boxes)?
3. Is `BINDINGS` the only place those four level keys are written?
FAIL if: a level key written as a literal outside `bindings.ts` / fixtures / tests; any visual element
added that does not encode data.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 30 min; 1–2 rounds.

**S9. A views store exists as a tested Python module over SQLite.**
NEW `server/__init__.py`, `server/views_store.py`, `server/tests/__init__.py`,
`server/tests/test_views_store.py`, `server/requirements.txt`, `pytest.ini`. EXTEND `.gitignore`
(add `.venv/`, `data/`).

WHAT TO BUILD:
- `requirements.txt`: `fastapi`, `uvicorn`, `pytest`, `httpx` (pinned to current versions at the time).
  Set up with `python3 -m venv .venv` and `.venv/bin/pip install -r server/requirements.txt`.
- `views_store.py`, no web code. `class ViewsStore(db_path: Path)`; schema created on open:
  `folders(section, path, PRIMARY KEY(section,path))`, `views(id INTEGER PK, section, folder, name, slug,
  state_json, created, updated, UNIQUE(section, folder, slug))`. Sections are exactly `Public`,
  `Private`; anything else → `ValueError`.
- Methods: `tree(section) -> {folders: {...}, views: [...]}` (same nesting as barra's `ViewTree` in
  `src/api/types.ts`), `load(section, folder, slug) -> ViewDoc`, `save(section, folder, name, state) ->
  file` (upsert by slug, keeps `created`), `delete_view`, `make_folder`, `rename_folder` (moves its
  views and sub-folders in one transaction), `delete_folder` (refuses if not empty), `move_view`,
  `rename_view`.
- `file` (the client-facing id) = `<section>/<folder path>/<slug>`, same shape barra used.
- Folder paths: segments joined by `/`. Reject empty segments, `.`, `..`, and any `\`. `slugify` follows
  barra's `views_repo.slugify` rules; read barra_poc `python_src/views_repo.py` and match them.
- `schema_version` in every stored doc is `2` (level keys, not risk_api names).
IMPORTS: stdlib `sqlite3` only.
ASSUMES LANDED: S1 (for `.gitignore`); independent of S2–S8.
MUST NOT TOUCH: `src/` (every frontend step).
TESTS FIRST: `test_views_store.py` (tmp_path DB): save→load round-trip; re-save keeps `created`;
rename_folder carries nested views; delete_folder on a non-empty folder raises; `..` and `\` rejected;
unknown section rejected; tree nesting shape. Red: module absent.
GATE: §2 standard checks (including pytest).
REVIEW (deep tier):
1. Can any input write outside its section or folder? Try `..`, `/` prefixes, unicode look-alikes.
2. Is every multi-row change (rename/move) one transaction?
3. Are all SQL statements parameterised?
FAIL if: string-built SQL; a rename that can half-apply; a path check that only looks at the last segment.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 30 min; 1–2 rounds (deep).

**S10. The views store is served over HTTP with the route shapes barra's Repository already uses.**
NEW `server/views_api.py`, `server/tests/test_views_api.py`.

WHAT TO BUILD:
- FastAPI `app` with routes matching barra's `views_api.py` router, mounted at `/views`:
  GET `/views` → `{sections: {Public: tree, Private: tree}}`; GET `/views/item/{file:path}`;
  PUT `/views/save` `{name, folder, state}` → `{file}`; DELETE `/views/item/{file:path}`;
  POST `/views/move`, `/views/rename`, `/views/folder`, `/views/folder/rename`; DELETE
  `/views/folder/{rel:path}`. Read barra_poc `python_src/views_api.py` for each body shape and copy it.
- `ValueError` → 400, missing → 404, folder not empty → 409.
- DB path from env `VIEWS_DB`, default `<repo>/data/views.db`, directory created on start.
- Run: `.venv/bin/uvicorn server.views_api:app --host 127.0.0.1 --port 8020`.
IMPORTS: `server/views_store.py` (`ViewsStore`).
ASSUMES LANDED: S9.
MUST NOT TOUCH: `src/`.
TESTS FIRST: `test_views_api.py` with FastAPI `TestClient` over a tmp DB: each route's happy path, plus
the 400/404/409 cases. Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Does each route's request/response match barra's `views_api.py` exactly, so `src/api/views.ts`
   needs only a base-URL change?
2. Does the server bind to loopback only?
FAIL if: a route shape differs from barra's without a DECISIONS-OPEN entry; listening on 0.0.0.0.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 20 min; 1 round.

**S11. The Repository panel saves and loads views from the new store.**
EXTEND `src/api/views.ts`, `src/api/types.ts`, `src/pivot/Repository.tsx`, `vite.config.ts`,
`src/routes/Pivot.tsx`. NEW `src/api/views.test.ts`, `src/pivot/Repository.test.tsx`.

WHAT TO BUILD:
- `vite.config.ts`: proxy `${base}views-api` → `process.env.VIEWS_TARGET ?? "http://127.0.0.1:8020"`,
  prefix stripped.
- `views.ts` uses its own base `${BASE_URL}views-api` (same `apiGet`/`apiSend` helpers, given a base
  argument; add an optional `base` parameter to both in `src/api/client.ts` only if needed, and then list
  that file in a DECISIONS-OPEN entry).
- `types.ts`: `ViewDoc.schema_version: 2`. Loading a doc whose `schema_version` is not 2 shows one line
  ("saved before ActivePivot fields; not loadable") and loads nothing.
- `Repository.tsx`: section switch, folder tree, save/load/delete, new folder; behaviour as the seed.
IMPORTS: `src/api/client.ts`.
ASSUMES LANDED: S8, S10.
MUST NOT TOUCH: `server/`.
TESTS FIRST: `views.test.ts` (mocked fetch): URLs go to `/flexagg2++/views-api/views…`.
`Repository.test.tsx`: a v1 doc is refused with the message; a v2 doc applies rows/cols/measures/filters
to the pivot config. Red: new expectations fail against the seed.
GATE: §2 standard checks.
Optional live smoke (reported): with the store running, save a view, reload the page, load it.
REVIEW:
1. Does a loaded view restore level keys that the current cube model still has? What happens to one
   it does not have? (Expected: dropped, with one line naming it.)
2. Is the v1 refusal unmissable but quiet (one line, no modal, no colour beyond status)?
FAIL if: a v1 doc partly loads; risk_api's `/views` is still called anywhere.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 25 min; 1 round.

**S12. A reader can run the explorer from the README alone.**
NEW `README.md`, `docs/serving.md`.

WHAT TO BUILD:
- `README.md`: what it is (two sentences), the three processes to run (ActivePivot via barra_poc, risk_api
  on :8010, views store on :8020) with exact commands, `npm run dev`, env vars (`VITE_BASE`, `AP_TARGET`,
  `VIEWS_TARGET`, `VIEWS_DB`), the invariants (grid is a renderer, guards before MDX), and the layout.
  Plain English, the owner's voice: short sentences, no filler.
- `docs/serving.md`: the nginx locations a deploy would add (`/flexagg2++/`, `/flexagg2++/ap/`,
  `/flexagg2++/api/`, `/flexagg2++/views-api/`, all behind basic auth), marked "not applied". Note that
  the base path clashes with barra_poc's live deploy, and that :9095 answers anonymously as admin and
  must not be exposed without the proxy.
ASSUMES LANDED: S11.
MUST NOT TOUCH: everything under `src/` and `server/`.
TESTS FIRST: none, docs only (not code under the TDD gate).
GATE: every command in the README runs as written on this machine (the implementer runs each and
reports exit codes) and the owner confirms: (a) a newcomer could start it from the README alone; (b) every
path and env var named exists; (c) no sentence explains what a previous one already said.
REVIEW: the owner reads it. No sub-agent review (docs-only commits are not gated).
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 15 min; owner read at the end.

## 6. What NOT to do

- **Do not call risk_api `/pivot` from the new grid "as a fallback".** Two sources of numbers for one grid
  makes any mismatch undiagnosable. The guard rules are the only thing taken from risk_api.
- **Do not sum, average or fill numbers in the browser**, totals included. VaR is non-additive. Margins
  are separate MDX queries.
- **Do not build MDX by string concatenation outside `src/ap/mdx.ts`.**
- **Do not use the ActivePivot content server for views.** The owner chose its own store, and it is
  in-memory on this cube anyway.
- **Do not add an MDX editor or free-text MDX box.** It bypasses every guard. Not in scope.
- **Do not copy more barra routes "because they're nearly free".** Each brings risk_api coupling; the
  second plan ports them deliberately.
- **Do not add an ActivePivot client library** (e.g. Atoti UI SDK packages). They are licensed; this stack
  stays free.

## 7. Definition of done

Run once, in order, from `/home/abrennan/dev/flexagg2++` on branch `activepivot-explorer`:

1. `npm ci` → exit 0
2. `npx tsc -b` → exit 0
3. `npx vitest run` → exit 0 (the one full frontend run)
4. `.venv/bin/python -m pytest -q server/tests` → exit 0 (the one full backend run)
5. `npx vite build` → exit 0
6. `grep -rn '"/pivot"\|/views"' src --include=*.ts --include=*.tsx | grep -v views-api` → no output
7. `git log --oneline activepivot-explorer` shows one commit per step S1–S12, each after a review PASS
   (S12 owner-read)
8. Live smoke, with :9095, :8010 and :8020 up: open `/flexagg2++/pivot`, pick a manager/date/set, build
   Factor × Net exposure, expand a factor group, save the view, reload, load it. Reported by the
   orchestrator; the owner confirms at the S12 break.

## 8. Review findings — disposition

(Filled per round. Cap 3, per D4.)

## 9. DECISIONS-OPEN

(Empty at start.) Pre-noted for the owner, not blocking:

- ActivePivot on :9095 listens on all interfaces and grants anonymous ROLE_ADMIN (it accepted a content
  write and delete on 2026-10-03). That is a barra_poc setting, outside this plan.

## 10. As built

(Written from the tracker at the end.)
