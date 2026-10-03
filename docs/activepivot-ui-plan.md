# Plan — flexagg2++: a React/Vite pivot explorer on native ActivePivot

Status: READY at cap, revision 4 (2026-10-03). Branch `activepivot-explorer`.
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
| Context bar field → level | `src/ap/bindings.ts` (S7) |
| Number formatting / RAG colours | `src/lib/format.ts` |
| Saved-view storage | `server/views_store.py` (S9) |

Found by reading the seed: `client.ts` is the only `fetch` wrapper, `format.ts` the only formatter, and
`usePivot.ts` the only place a `/pivot` call is built.

**Live facts (probed 2026-10-03; quote them, do not re-derive).**

- ActivePivot 6.1.20 (Atoti 0.9.15) on `127.0.0.1:9095`. REST root /activeviam/pivot/rest/v9. One catalog
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

- **Owner amendment (2026-10-03, after round 2): dev port 5175, served at `/`.** No `/flexagg2++/` prefix
  anywhere, so nothing collides with barra_poc's deploy. Same-origin paths are `/api` (risk_api),
  `/ap` (ActivePivot) and `/views-api` (views store). No `VITE_BASE` variable.
- Views service on `127.0.0.1:8020`.
- Views store: FastAPI + SQLite (data/views.db, gitignored), its own `.venv`. That's the house stack,
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

**Target.** No frozen output to match. What plays that role: the trimmed seed's 42 passing tests (11 files) at S1,
and the fixture-driven suites S3–S6 add. Behaviour that must survive is pinned by the seed's existing
`usePivot`, `PivotGrid`, `ChartMode` and `Pivot` tests, which S7 changes only where the transport changes.

**Suite baseline.** At barra_poc 442d2bc: `npx vitest run` → 15 files, 63 tests, all passing. Nothing red
at the start. After S1's trim the suite is 11 files / 42 tests (the 21 dropped tests belong to the removed
routes; measured by round 1 on a scratch copy).

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
  `vite.config.ts`: `export default defineConfig(({ mode }) => { const env = loadEnv(mode, ".", ""); … })`
  with `base: "/"`, dev `port: 5175`, `strictPort: true`. Not `process.env`: there is no `@types/node`,
  and `loadEnv` with prefix `""` also reads shell env vars (verified in round 1). The risk_api proxy key
  becomes `/api` (prefix `/api` stripped, `x-accel-buffering` hook kept).
- Drop the `/flexagg2++` prefix (§3 owner amendment): `src/api/client.ts` `API_BASE = "/api"`;
  `src/main.tsx` `BrowserRouter` loses its `basename`; `index.html` title → `ActivePivot explorer`.
- `hooks.ts` keeps only the hooks that the copied files import; delete the rest. `types.ts` likewise.
  Deleting is the only change to them.
- If a kept file imports something not on the list, STOP-AND-REPORT; do not copy more.

IMPORTS: none new.
ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/ap/` (S2–S8), `server/` (S9–S10).
TESTS FIRST: exempt in substance (a copy with its own tests). Copy the test files before the source files
so the edit order holds.
GATE: `npm ci` exits 0 and `npx tsc -b` exits 0 and `npx vitest run` exits 0 and `npx vite build` exits 0
and `npx vitest run` reports 11 files / 42 tests passed and `git ls-files src/routes` lists exactly
`Pivot.tsx`, `Pivot.test.tsx`, `Pivot.rejection.test.tsx`.
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
- `AP_BASE = "/ap"`; REST root
  `${AP_BASE}/activeviam/pivot/rest/v9`.
- `class ApError extends Error { status: number; chain: string[] }` with
  `constructor(status: number, message: string, chain: string[] = [message])`. From a response, message = first `errorChain` message
  with the leading `[400] ` and any Java class prefix up to the last `: ` removed; `chain` keeps them all.
  Non-JSON error body → message `HTTP <status>`.
- `apDiscovery(): Promise<RawDiscovery>` = GET `/cube/discovery`, unwraps `data` if present.
- `apMdx(mdx: string, opts?: {timeLimitS?: number; signal?: AbortSignal}): Promise<RawCellSet>` = POST
  `/cube/query/mdx` body `{mdx, context: {queriesTimeLimit: String(timeLimitS ?? 30)}}`, unwraps `data`.
- `RawDiscovery`, `RawCellSet` types: exactly the fields in §2 "Live facts", nothing speculative.
- `vite.config.ts`: add proxy `/ap` → `env.AP_TARGET || "http://127.0.0.1:9095"` (S1's `loadEnv`), prefix
  stripped, `changeOrigin: true`. The existing `/api` proxy is unchanged.
IMPORTS: none (this is the owner).
ASSUMES LANDED: S1.
MUST NOT TOUCH: `src/api/client.ts` (risk_api's owner, stays as is).
TESTS FIRST: `src/ap/client.test.ts` with mocked `fetch`: URL and body of `apMdx` include the time limit;
`data` unwrapping; an `errorChain` body becomes `ApError` with the trimmed message; a non-JSON 500 becomes
`HTTP 500`. Red because `src/ap/client.ts` does not exist.
GATE: §2 standard checks.
REVIEW:
1. Does the `/ap` proxy strip exactly the prefix `AP_BASE` adds, so `/ap/activeviam/...` reaches
   `/activeviam/...` on :9095?
2. Can an aborted request surface as an unhandled rejection?
3. Does the error trimming ever drop the whole message (empty string)?
FAIL if: any `fetch` outside `src/ap/client.ts` targets ActivePivot; a type field not in §2's live facts.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 15 min; 1 round.

**S3. The cube's shape is available as a typed model built from discovery.**
NEW `src/ap/discovery.ts`, `src/ap/discovery.test.ts`, `src/ap/__fixtures__/discovery.json`. EXTEND
`src/ap/client.ts` (widen `RawDiscovery` to exactly the discovery fields `toCubeModel` reads, as the live response
spells them; amendment 2026-10-03, S2 left it minimal).

WHAT TO BUILD:
- Fixture: the live discovery response, trimmed to the `Exposures` cube with every dimension/hierarchy/level
  kept and measures cut to about 15 (include `contributors.COUNT`, `Net exposure`, `Scenario VaR 99`,
  `Total VaR 99`, `Manager MV`, `Factor contribution`, and at least two with `visible: false`).
  Discovery holds names only, no cell values, so it passes the §2 data rule.
- `interface LevelRef { dim: string; hier: string; level: string }`, `levelKey(r) = "[d].[h].[l]"` with
  `]` escaped as `]]` inside each part, and `parseLevelKey` as its exact inverse.
- `interface CubeModel { cube: string; levels: LevelInfo[]; measures: MeasureInfo[]; slicing: string[] }`.
  `LevelInfo = LevelRef & { key; caption; depth; slicing: boolean }`. Leaves out `ALL` levels and the
  `Epoch` dimension. `CubeModel.slicing` = the level keys of slicing hierarchies (no `ALL` level: Units,
  StressShock, CorrStress, ScenarioDay on this cube); their single level has depth 1. `MeasureInfo = { name; caption; formatString; visible }`.
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
  filters: Record<string, string[]>; nonEmpty: boolean; slicing: string[] }`. Row/col/filter keys are
  level keys (S3); `slicing` is `CubeModel.slicing`, passed through by the caller.
- **Member identity is the full path, never a bare name.** A member value in a filter or a record is a
  *path string*: the member's `namePath` below `AllMember`, joined with `\u241E` (`pathKey(parts)` /
  `splitPath(s)` live here). `memberKey(levelKey, path, slicing)` writes
  `[d].[h].[ALL].[AllMember].[p1]…[pn]`, each part through `esc`; for a level in `slicing` it writes
  `[d].[h].[level].[p1]` instead (the `ALL` form is a 400 there, the short form works — checked live). Why: on this cube
  `[Securities].[Security].[Sector].[Energy]` silently resolves to the first Energy (one country's),
  which gives wrong numbers with no error (round 1, checked live). `measureKey(name)` =
  `[Measures].[esc(name)]`, `esc` doubling `]`.
- **One set per hierarchy on an axis.** If `rows` (or `cols`) names several levels of one hierarchy,
  only the deepest goes on the axis (`<deepest>.Members`); the shallower ones are filled from the
  position's `namePath` by S5. Why: `CrossJoin` of two levels of one hierarchy is a 400 (checked live), and
  the drill sends exactly that (Country→Sector).
- `buildMdx(q): string`:
  - COLUMNS = `{measures}` crossed with `cols` level members if `cols` is non-empty.
    ROWS = crossjoin of `<level>.Members` for each row level; omitted when `rows` is empty (grand total).
    `NON EMPTY` on both axes when `q.nonEmpty`.
  - Filters: a single-member filter on a hierarchy **not** on any axis goes into `WHERE` as a tuple.
    Every other filter (several members, or its hierarchy is on an axis) becomes a sub-select,
    `FROM (SELECT {m1, m2} ON COLUMNS FROM [cube])`, nested once per filtered hierarchy. Why: a WHERE on
    a hierarchy that is also on an axis is a 400 (checked live) — e.g. the context Date with Date on rows,
    or a drill parent with the child level on the axis. Never both a WHERE and a sub-select on one
    hierarchy.
  - Empty `measures` → throw `Error("select at least one measure")`.
- No string from the user reaches the output except through `esc`.
IMPORTS: `src/ap/discovery.ts` (`levelKey`, `parseLevelKey`).
ASSUMES LANDED: S3.
MUST NOT TOUCH: `src/ap/cellset.ts` (S5).
TESTS FIRST: `mdx.test.ts`: exact strings for (a) one row level + two measures, (b) two row levels
(crossjoin), (c) one col level, (d) single-member filter → WHERE, (e) two-member filter → sub-select,
(f) a member named `a]b` comes out as `[a]]b]`, (g) no rows → no ROWS axis, (h) empty measures throws,
(i) a Sector member is written with its full Country path, (j) rows Country+Sector put only
`[Securities].[Security].[Sector].Members` on the axis, (k) a Date filter with Date on rows becomes a
sub-select, not WHERE, (l) a Units `$` filter (Units in `slicing`) is written `[Units].[Units].[Units].[$]`.
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

**S4b. The MDX builder picks the deepest level by real depth and is fully pinned by tests.** (Inserted
2026-10-03 from S4's deep review, four IMPORTANT findings outside its FAIL list; §18.6. UNREVIEWED block: a
disagreement with it is a DISAGREEMENTS entry.)
EXTEND `src/ap/mdx.ts`, `src/ap/mdx.test.ts`, `src/ap/discovery.ts`.

WHY NOW: S5 cuts each level's path at its depth and S7 lets the user reorder row fields; both need depth in
the query, and S4 inferred "deepest" from caller order, which silently drops the deeper level when reversed.

WHAT TO BUILD:
- `ApQuery` gains `depth: Record<string, number>` (level key → `LevelInfo.depth`; callers fill it from the
  `CubeModel` the way they fill `slicing`). `buildMdx` throws `Error("no depth for <key>")` for any `rows`/`cols`
  key it lacks. One set per hierarchy on an axis is the level with the greatest depth, whatever the order given;
  hierarchies keep first-seen order. Every existing test passes a `depth` map; their expected strings do not change.
- `memberKey` normalises its level key itself (`parseLevelKey` → `levelKey`) before writing it and before the
  `slicing` check; `buildMdx` stops normalising on its behalf.
- `buildMdx` throws explicitly when one hierarchy is on both rows and cols (`Error("hierarchy on two axes: <h>")`),
  and when a member path has an empty part (`Error("empty member name")`).
- `esc` has one owner: export it from `discovery.ts`; `mdx.ts` imports it and deletes its own copy.
IMPORTS: `src/ap/discovery.ts` (`levelKey`, `parseLevelKey`, `esc`).
ASSUMES LANDED: S4.
MUST NOT TOUCH: `src/ap/cellset.ts` (S5), `src/ap/client.ts`.
TESTS FIRST (in `mdx.test.ts`, before the code): rows `[Sector, Country]` (reversed) puts only Sector on the axis,
exact string; missing depth throws; a multi-part slicing member throws; members holding `[`, `'` and a newline
come out exact; same hierarchy on rows and cols throws; empty path part throws; `memberKey` given an unnormalised
key writes the normalised form. Every throw assertion is exact (`toThrow(/^…$/)`), including (h).
GATE: §2 standard checks, and `grep -cF 'replace(/\]/g' src/ap/mdx.ts` prints `0`, and
`grep -cF 'replace(/\]/g' src/ap/discovery.ts` prints `1`.
REVIEW:
1. Can any order of `rows`/`cols` put a shallower level of a hierarchy on the axis?
2. Is every throw tested with an exact message?
3. Did any S4 expected MDX string change? (It must not.)
FAIL if: a shallower level can win; an S4 expected string changed; `esc` defined twice.
ROLLBACK: one `git revert` of this step.
BUDGET: 15 min; 1 round (deep tier: it touches the escaping).

**S4c. Non-slicing members are written under the hierarchy, as the plan said.** (Inserted 2026-10-03 from S7's
report; §18.6. UNREVIEWED block: a disagreement with it is a DISAGREEMENTS entry.)
EXTEND `src/ap/mdx.ts`, `src/ap/mdx.test.ts`.

WHY NOW: S4 wrote `memberKey` as `[d].[h].[level].[ALL].[AllMember].[p1]…` — the level name before `[ALL]` —
where S4's own WHAT TO BUILD says `[d].[h].[ALL].[AllMember].[p1]…`. ActivePivot answers 400 to the level form
on every filter (orchestrator re-checked: a Date WHERE is 400 in the level form, 200 in the hierarchy form). S4's
tests pinned the wrong form and its live checks only exercised the slicing form. Every context filter in S7 is
a member, so nothing filtered runs until this lands.

WHAT TO BUILD:
- `memberKey(levelKey, path, slicing)` writes `[d].[h].[ALL].[AllMember].[p1]…[pn]` for a non-slicing level
  (dimension and hierarchy from the level key, each through `esc`). The slicing form is unchanged.
- Update every expected string in `mdx.test.ts` that contains a non-slicing member to the hierarchy form. No other
  expected string changes. Add one test whose name says why (the level form is a 400 live).
IMPORTS: `src/ap/discovery.ts` (`parseLevelKey`, `esc`).
ASSUMES LANDED: S4b.
MUST NOT TOUCH: every S7 file (`src/ap/pivotSource.ts`, `src/ap/bindings.ts`, `src/pivot/*`, `src/routes/*`).
TESTS FIRST: change the expected strings and add the new test first; red against S4b's code.
GATE: §2 standard checks (S7's unstaged work is in the tree; the suite must still pass with it), and a scratch
probe outside the repo that sends `buildMdx` output to :9095 for four shapes — a single-member WHERE (Date), a
multi-member sub-select on an axis hierarchy (two Countries, Country on rows), a Sector path filter with Sector on
rows (the drill shape), and Units `$` — and prints the four HTTP codes: all `200`. Report codes only.
REVIEW:
1. Is any non-slicing member still written with a level name before `[ALL]`?
2. Did any expected string change other than member spellings?
FAIL if: the level form survives anywhere; a probe shape is not 200.
ROLLBACK: one `git revert` of this step.
BUDGET: 10 min; 1 round (deep tier: it changes MDX text).

**S5. An MDX cellset becomes the `PivotResult` shape the grid already renders.**
NEW `src/ap/cellset.ts`, `src/ap/cellset.test.ts`, `src/ap/__fixtures__/cellset-rows.json`,
`src/ap/__fixtures__/cellset-rows-cols.json`.

WHAT TO BUILD:
- `cellsetToRecords(cs: RawCellSet, q: ApQuery): Rec[]`: one record per (row position × col position).
  Keys: **each level key exactly as given in `q.rows`/`q.cols`** (that is what `usePivot`'s
  `rowsFromRecords` reads as `rec[dim]`), plus one key per measure name. The value under a level key is
  the S4 path string for that level (taken from the position's `namePath` with a leading `AllMember`
  dropped only when present — slicing hierarchies have none — cut at that level's depth, so a shallower
  level of the same hierarchy is filled too). The display caption goes under
  `labelKey(levelKey)` = `levelKey + "#label"` (last `captionPath` entry at that depth). Missing
  ordinal → `null`. Column count = `axes[id 0].positions.length`.
- `toPivotResult(parts: {body: RawCellSet; perRow?: RawCellSet; perCol?: RawCellSet; grand?: RawCellSet},
  q): PivotResult` fills `records`, `per_row`, `per_col`, `grand` exactly as `src/api/types.ts`
  `PivotResult` defines them. `warning: null` (S6 owns warnings).
- Fixtures are hand-written in the live shape (§2), with made-up values.
IMPORTS: `src/ap/client.ts` (`RawCellSet`), `src/ap/mdx.ts` (`ApQuery`), `src/api/types.ts`
(`PivotResult`, `Rec`).
ASSUMES LANDED: S4.
MUST NOT TOUCH: `src/pivot/usePivot.ts` (S7).
TESTS FIRST: `cellset.test.ts`: rows-only fixture gives the right records; rows×cols fixture maps ordinal
`c + r*nCols` correctly; a sparse cell is `null`; two Sector members with the same caption under different
countries get different path values; `grand` is a single record of measures. Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Is there any sum, average, or fill of a missing value? (VaR is non-additive: there must be none.)
2. Does the ordinal arithmetic hold when the column axis has more than one hierarchy?
3. Do the record keys match what `PivotGrid.tsx` and `ChartMode.tsx` read from records, without changing
   what they read? (Header captions are S7's job.)
FAIL if: any arithmetic on cell values; a change to `src/api/types.ts`.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 25 min; 1 round.

**S6. barra's pivot safety rules run in the browser before any MDX is sent.**
NEW `src/ap/guards.ts`, `src/ap/guards.test.ts`. EXTEND `src/api/types.ts` (add
`price_dependent?: string[]` and `dollar_measures?: string[]` to `Dims`; risk_api already returns both).

WHAT TO BUILD:
- `interface GuardRules { scenarioDependent: Set<string>; dayDependent: Set<string>;
  priceDependent: Set<string>; managerIndependent: Set<string>; dollarMeasures: string[];
  multiManager: boolean; latestDate: string | null }`.
- `rulesFromDims(dims: Dims, managers: number): GuardRules`. Lists come from risk_api `/dims`
  (`scenario_dependent`, `day_dependent`, `price_dependent`). `managerIndependent` is the constant
  `["Factor contribution","Specific PnL","Realized PnL"]`, with a comment naming barra_poc
  `risk_api.py` `MANAGER_INDEPENDENT_MEASURES` as its source. `latestDate` = last of `dims.dates`.
- `checkQuery(q: ApQuery, rules, bind: Bindings): {ok: true; q: ApQuery; notice: string | null} |
  {ok: false; error: string}`. Rules, in order:
  1. a manager-independent measure with `multiManager` → error (same wording idea as risk_api's 400).
     `multiManager` = more than one manager loaded in the cube (`/meta` `managers` length), not
     "more than one selected": risk_api refuses these three on every multi-manager query, filtered or
     not, because the baked column reads one arbitrary manager's numbers under any label;
  2. a scenario-dependent measure and the ScenarioSet level not filtered to exactly one member and not on
     an axis → error "pick one scenario set";
  3. a scenario/day/price-dependent measure, Manager on an axis, Date neither on an axis nor filtered →
     add the `latestDate` filter, `notice` says so (risk_api's 60 s pathology).
  4. a day-dependent measure with no DaySet filter, or a price-dependent measure with no PriceSet filter →
     `notice` (risk_api's `_pivot_result` warns on both; on this cube both hierarchies have an `ALL`
     level, so the MDX path has the same gap).
  Rule 2 is an error where risk_api only warns. That is deliberate: a null column is worse than a refusal.
- `Bindings` (`{manager; date; scenarioSet; units}` level keys) is defined here and stays here; S7's
  `BINDINGS` is typed `Bindings`. The test passes literal keys.
- `useGuardRules()` hook reading `useDims` + `useMeta` from `src/api/hooks.ts`.
IMPORTS: `src/api/hooks.ts` (`useDims`, `useMeta`), `src/api/types.ts` (`Dims`), `src/ap/mdx.ts` (`ApQuery`).
ASSUMES LANDED: S4.
MUST NOT TOUCH: `src/ap/bindings.ts` (S7).
TESTS FIRST: `guards.test.ts`: one case per rule firing, one per rule not firing, and rule order (1 wins
over 2). Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Does each rule match its risk_api counterpart (`_validate_pivot`, the ScenarioSet `warning`,
   `_needs_date_default`)? Read /home/abrennan/dev/barra_poc/python_src/risk_api.py to answer.
2. Is the guard pure (no fetch, no hook) apart from `useGuardRules`?
3. When `/dims` has not loaded, does the pivot wait, or run unguarded? It must wait.
FAIL if: a rule is weaker than its risk_api counterpart; the list of three measures is spelled
differently from risk_api's.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 20 min; 1 round.

**S7. The pivot grid and chart mode run on ActivePivot instead of risk_api `/pivot`.**
NEW `src/ap/pivotSource.ts`, `src/ap/pivotSource.test.ts`, `src/ap/bindings.ts`, `src/ap/bindings.test.ts`.
EXTEND `src/pivot/usePivot.ts`, `src/pivot/usePivot.test.ts`, `src/pivot/ChartMode.tsx`,
`src/pivot/ChartMode.test.tsx`, `src/pivot/PivotGrid.tsx`, `src/pivot/PivotGrid.test.ts`,
`src/routes/Pivot.tsx`, `src/routes/Pivot.test.tsx`, `src/routes/Pivot.rejection.test.tsx`.

WHAT TO BUILD:
- `fetchPivotLevel(args: {cube; rows; cols; measures; filters; totals; rowTot}, rules, bind,
  signal?): Promise<PivotResult>`: `checkQuery` → if not ok, throw `ApError(400, error)` so the existing
  rejection UI shows it. Then one MDX for the body, and when totals are asked, separate MDX for `per_row`
  (rows only), `per_col` (cols only) and `grand` (no rows), in parallel. Notice → `PivotResult.warning`.
- `usePivot.ts`: both `/pivot` call sites (`queryLevel` and the one in `reload`) call `fetchPivotLevel`.
  Drill, sort, hide-empty, splice and every other behaviour stay as they are. Row/col/filter keys are now
  level keys and member values S4 path strings; `DisplayRow.label` shows `rec[labelKey(dim)]`. Every
  `buildMdx` call passes `slicing: model.slicing`.
- `PivotGrid.tsx` gains an optional `captions: Record<string, string>` prop (level key → discovery
  caption, column-member path → its `#label`), filled by `usePivot`. The label-column header and the
  `<col member> · <measure>` headers use it, so no header shows a bracketed key or a `\u241E` path.
  Sort column ids are unchanged.
- `bindings.ts` (moved here from S8 so the context fold has an owner): `BINDINGS = { manager:
  "[Positions].[Manager].[Manager]", date: "[Exposures].[Date].[Date]", scenarioSet:
  "[Scenarios].[ScenarioSet].[ScenarioSet]", units: "[Units].[Units].[Units]" }`;
  `checkBindings(model: CubeModel): string[]` returns the keys missing from the model;
  `contextFilters(ctx: {manager; date; scenario}): Record<string,string[]>` turns AppContext's
  context into level-key filters, an empty value adding nothing. Every value is a one-part path.
- `Pivot.tsx`: merged filters = `contextFilters(ctx)` overlaid by the user's own (user wins on the same
  level). Remove the what-if bar (`useWhatif`, `HypoBar`, `cfg.whatif`/`shocks`) and the `/analysis`
  StreamPanel (§1). Replace the hard-coded short names (default `rows`, the `Date`/`ScenarioSet`
  filters, the `onAxis` check) with `BINDINGS` keys; the default row field is `bindings.ts`
  `DEFAULT_ROWS = ["[FactorMeta].[FactorDim].[FactorGroup]"]`.
- No query runs until the guard rules have loaded (`useGuardRules()` defined → TanStack `enabled`). A
  pivot never runs unguarded.
- `nonEmpty` is always `true` (risk_api's `/pivot` never returned empty rows either); the existing
  hide-empty toggle keeps its current client-side meaning.
- Units: `cfg.units === "dollar"` becomes a filter `BINDINGS.units` = `$`; `weight` adds nothing. When it is
  `$`, the result carries `units: "dollar"` and `dollar_measures` = the requested measures that are in
  `rules.dollarMeasures`, so PivotGrid's money formatting still works.
- Remove the `whatif`/`shocks` fields from `PivotConfig` and `hypoParams` (§1: not in this plan).
  Delete only the tests that exercise them. Name each deleted test in the report.
- `ChartMode.tsx` fetches each named query through `fetchPivotLevel` with no drill. Vega-Lite reads `.` and
  `[` in a field name as nested access, so the chart's records are re-keyed to plain aliases (`f0`, `f1`…)
  with the level's caption as the axis title.
IMPORTS: `src/ap/pivotSource.ts` imports `src/ap/client.ts`, `src/ap/mdx.ts`, `src/ap/cellset.ts`,
`src/ap/guards.ts`. Nothing else may call `apMdx`.
ASSUMES LANDED: S5, S6.
MUST NOT TOUCH: `src/pivot/FieldList.tsx` (S8), `src/shell/ContextBar.tsx`.
TESTS FIRST: `bindings.test.ts`: `checkBindings` against the S3 fixture returns `[]`, and against a copy
missing Units returns `["units"]`; `contextFilters` drops empties. `pivotSource.test.ts` (mock `apMdx`):
guard error → `ApError` 400 with no MDX sent; totals issue 4 MDX calls, no totals issue 1; a notice ends
up in `warning`; Units `$` sets `dollar_measures`. Then update `usePivot.test.ts` so its
mock is `fetchPivotLevel`, not `apiGet`. Red: `pivotSource.ts` absent, and `usePivot.test.ts` expects
the new mock.
GATE: §2 standard checks and `grep -rn '"/pivot"' src/api src/ap src/pivot` prints nothing (the router's
own `"/pivot"` route in `App.tsx`/`LeftRail.tsx` is not an API call).
Optional live smoke (report the result, it does not block): with :9095 up, `npx vite` and load
`http://localhost:5175/pivot`, rows Factor level, measure Net exposure, one manager + date; the grid fills.
REVIEW:
1. Are the margins still cube-computed, separate queries? Is any total summed in the browser?
2. Do the drill tests still prove expand → one query for the next level, filtered to the parent path?
3. Is each test deletion only for the removed what-if/shocks path or the removed `/analysis` panel?
4. Is `BINDINGS` the only place those four level keys are written?
FAIL if: a client-side sum; a test deleted that is not about what-if/shocks; `apMdx` called outside
`pivotSource.ts`.
ROLLBACK: a single `git revert` of this step's commit. S8 depends on it; revert S8 first.
BUDGET: 30 min; 1–2 rounds. The biggest behaviour change in the plan.

**S8. The field list and its filter pickers speak ActivePivot levels.**
NEW `src/pivot/FieldList.test.tsx`. EXTEND `src/pivot/FieldList.tsx`, `src/ap/pivotSource.ts`,
`src/ap/pivotSource.test.ts`, `src/routes/Pivot.tsx`, `src/routes/Pivot.test.tsx` (amendment 2026-10-03: its chip
expectations pin the bracketed keys S8 removes).

WHAT TO BUILD:
- `pivotSource.ts` gains `fetchMembers(levelKey): Promise<{path: string; label: string}[]>`: the MDX is
  `buildMdx({cube, rows: [levelKey], cols: [], measures: ["contributors.COUNT"], filters: {},
  nonEmpty: true, slicing: model.slicing})` (no MDX text written here, §6), sent with `apMdx`, mapped with `cellsetToRecords` to
  `{path: rec[levelKey], label: rec[labelKey(levelKey)]}`. Cached per level with TanStack Query. `FieldList`'s filter picker reads members from it instead of `dims.members[dim]`.
- Delete `FieldList`'s two amber warnings (`scenCtx`, `dayCtx`, keyed on `"ScenarioSet"`/`"DaySet"`):
  S6's guards own those rules and surface them through `warning` and the rejection line.
- `Pivot.tsx`: if `checkBindings` (S7) is non-empty, show one line naming the missing levels; the pivot
  still works without the context.
- `FieldList.tsx`: sources come from `useCubeModel()`. Dimensions grouped by dimension → hierarchy →
  levels in depth order, captions shown. Measures: visible only, alphabetical, with a text filter box.
  Drag and drop zones are unchanged. Field ids are level keys.
- The context bar itself (`ContextBar.tsx`) is unchanged: it still reads risk_api `/meta`.
IMPORTS: `src/ap/discovery.ts` (`useCubeModel`, `CubeModel`), `src/ap/bindings.ts` (`checkBindings`).
ASSUMES LANDED: S7.
MUST NOT TOUCH: `src/shell/ContextBar.tsx`, `src/context/AppContext.tsx`, `server/`.
TESTS FIRST: `FieldList.test.tsx`: renders the fixture's Securities levels in order; hidden measures
absent; the text filter narrows the list; the filter picker lists what a mocked `fetchMembers` returns.
`pivotSource.test.ts`: `fetchMembers` sends one `.Members` MDX and maps path and label. Red: the new
tests fail against S7's code.
GATE: §2 standard checks.
Optional live smoke (reported, not blocking): the field list shows 86 measures on the live cube.
REVIEW:
1. Can a filter picker ever offer a bare caption instead of a path (the Energy problem, S4)?
2. With 86 measures, is the list usable without scrolling past chrome (filter box first, Tufte: no
   icons, no boxes)?
FAIL if: a level key written as a literal outside `bindings.ts` / fixtures / tests; any visual element
added that does not encode data; `apMdx` called outside `pivotSource.ts`.
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
  barra's `views_repo.slugify` rules; read /home/abrennan/dev/barra_poc/python_src/views_repo.py and match them.
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

**S9b. A failed commit never leaves the views store inside a transaction.** (Inserted 2026-10-03 from S9's
deep review, IMPORTANT 1; §18.6. UNREVIEWED block: a disagreement with it is a DISAGREEMENTS entry.)
EXTEND `server/views_store.py`, `server/tests/test_views_store.py`.

WHY NOW: S10 serves the store, and a second SQLite connection (a backup, the sqlite3 CLI, a second worker) makes
`COMMIT` fail with "database is locked". S9's `_tx` runs `COMMIT` outside its `try`, so the connection stays in a
transaction: the caller is told the change failed while the store's own reads show it applied, and every later
write fails until restart (reproduced by the reviewer).

WHAT TO BUILD:
- `_tx`: `COMMIT` inside the `try`; on any exception, `ROLLBACK` if `in_transaction`, then re-raise.
- `ViewsStore.close()` and context-manager support (`__enter__`/`__exit__` closing the connection), so S10 can own
  the store's lifetime. Nothing else changes.
IMPORTS: stdlib only.
ASSUMES LANDED: S9.
MUST NOT TOUCH: `src/`, `server/views_api.py` (S10).
TESTS FIRST: a second `sqlite3` connection opens `BEGIN` and reads `views`; the store, opened with a short busy
timeout, attempts a write that must raise; then assert the store's connection is not `in_transaction`, its `tree`
does not show the failed change, and after the reader closes the next write succeeds. Plus: `with ViewsStore(p) as
s:` closes on exit. Red against S9's `_tx`.
GATE: §2 standard checks (including pytest).
REVIEW (deep tier):
1. Can any exception path (including during `COMMIT` and `BaseException`) leave `in_transaction` true?
2. Does the new test fail on S9's `_tx` (check by mutation)?
FAIL if: an exception path leaves the connection in a transaction; the test does not fail on S9's code.
ROLLBACK: one `git revert` of this step.
BUDGET: 10 min; 1 round.

**S10. The views store is served over HTTP with the route shapes barra's Repository already uses.**
NEW `server/views_api.py`, `server/tests/test_views_api.py`.

WHAT TO BUILD:
- FastAPI `app` with routes matching barra's `views_api.py` router, mounted at `/views`:
  GET `/views` → `{sections: {Public: tree, Private: tree}}`; GET `/views/item/{file:path}`;
  PUT `/views/save` `{name, folder, state}` → `{file}`; DELETE `/views/item/{file:path}`;
  POST `/views/move`, `/views/rename`, `/views/folder`, `/views/folder/rename`; DELETE
  `/views/folder/{rel:path}`. Read /home/abrennan/dev/barra_poc/python_src/views_api.py for each body shape and copy it.
- Status codes and the section-prefixed `folder` (`"Public/Risk"`) follow barra's `views_api.py`; where
  this plan and that file disagree, the file wins.
- DB path from env `VIEWS_DB`, default views.db under the repo's data directory, created created on start.
- Run: `.venv/bin/uvicorn server.views_api:app --host 127.0.0.1 --port 8020`.
IMPORTS: `server/views_store.py` (`ViewsStore`).
ASSUMES LANDED: S9.
MUST NOT TOUCH: `src/`.
TESTS FIRST: `test_views_api.py` with FastAPI `TestClient` over a tmp DB: each route's happy path, plus
the error cases barra's `views_api.py` raises. Red: module absent.
GATE: §2 standard checks.
REVIEW:
1. Does each route's request/response match barra's `views_api.py` exactly, so `src/api/views.ts`
   needs only a base-URL change?
2. Does the server bind to loopback only?
FAIL if: a route shape differs from barra's without a DECISIONS-OPEN entry; listening on 0.0.0.0.
ROLLBACK: a single `git revert` of this step's commit.
BUDGET: 20 min; 1 round.

**S11. The Repository panel saves and loads views from the new store.**
NEW `src/api/views.test.ts`, `src/pivot/Repository.test.tsx`. EXTEND `src/api/views.ts`, `src/api/types.ts`,
`src/pivot/Repository.tsx`, `vite.config.ts`, `src/routes/Pivot.tsx`.

WHAT TO BUILD:
- `vite.config.ts`: proxy `/views-api` → `env.VIEWS_TARGET || "http://127.0.0.1:8020"` (S1's `loadEnv`),
  prefix stripped.
- `views.ts` uses its own base `/views-api` (same `apiGet`/`apiSend` helpers, given a base
  argument; add an optional `base` parameter to both in `src/api/client.ts` only if needed, and then list
  that file in a DECISIONS-OPEN entry).
- `types.ts`: `ViewDoc.schema_version: 2`. Loading a doc whose `schema_version` is not 2 shows one line
  ("saved before ActivePivot fields; not loadable") and loads nothing.
- `Repository.tsx`: section switch, folder tree, save/load/delete; behaviour as the seed (it has no
  new-folder control, and none is added).
IMPORTS: `src/api/client.ts`.
ASSUMES LANDED: S8, S10.
MUST NOT TOUCH: `server/`.
TESTS FIRST: `views.test.ts` (mocked fetch): URLs go to `/views-api/views…`, and no URL starts `/api/views`.
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
  on :8010, views store on :8020) with exact commands, `npm run dev` (port 5175), env vars (`AP_TARGET`,
  `VIEWS_TARGET`, `VIEWS_DB`), the invariants (grid is a renderer, guards before MDX), and the layout.
  Plain English, the owner's voice: short sentences, no filler.
- `docs/serving.md`: what a deploy would need, marked "not applied": the app is built for `/`, so it gets
  its own host or port (not a path under barra's site), with `/ap/`, `/api/` and `/views-api/` proxied
  behind basic auth. Note that :9095 answers anonymously as admin and must not be exposed without the
  proxy.
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
6. `grep -rn '"/pivot"' src/api src/ap src/pivot` → no output (the views URLs are asserted by S11's
   `views.test.ts`)
7. `git log --oneline activepivot-explorer` shows one commit per step S1–S12, each after a review PASS
   (S12 owner-read)
8. Live smoke, with :9095, :8010 and :8020 up: open `http://localhost:5175/pivot`, pick a manager/date/set, build
   Factor × Net exposure, expand a factor group, save the view, reload, load it. Reported by the
   orchestrator; the owner confirms at the S12 break.

## 8. Review findings — disposition

(Filled per round. Cap 3, per D4.)

**Round 1 — input: source (barra_poc frontend + risk_api + live :9095). Verdict NOT YET, 8 findings.**
The orchestrator re-checked 1(c), 1(d) and 4 live / on disk before folding.

| # | Finding | Disposition |
|---|---|---|
| 1 | MDX shape wrong on multi-level hierarchies: bare deep member resolves to the first match; `.Members` of a deep level collapses on caption; CrossJoin of two levels of one hierarchy 400s; WHERE on an axis hierarchy 400s | Accepted. S4: full-path members, one set per hierarchy, sub-select for axis-hierarchy filters, tests (i)–(k). S5: path value per level + `#label` caption. S7: label shown |
| 2 | S5 short-name keys don't match `rowsFromRecords`' `rec[dim]`; Vega-Lite reads `.`/`[` as nesting | Accepted. S5 keys by level key, collision rule dropped. S7 aliases chart fields |
| 3 | S7 omits `src/routes/Pivot.tsx` (what-if bar, `/analysis` panel, hard-coded short names); `reload` is a second `/pivot` site | Accepted. Pivot.tsx and `bindings.ts` moved into S7; S8 keeps FieldList |
| 4 | `process.env` / `import.meta.env` don't type-check (no `@types/node`, no vite client types) | Accepted. S1 `loadEnv`; S2/S11 proxies use `env`. (a vite-env.d.ts file was added here, then dropped with the owner's base-path change: no `import.meta.env` left) |
| 5 | Filter pickers read `dims.members` keyed by risk_api names → empty | Accepted. S8 adds `fetchMembers` in `pivotSource.ts` |
| 6 | Dollar formatting lost (`units`/`dollar_measures` never set) | Accepted. S6 carries `dollar_measures`; S7 sets them |
| 7 | Trimmed suite is 11 files / 42 tests, not 63 | Accepted. §4 and S1 GATE |
| 8 | Parity: DaySet/PriceSet warnings missing; rule 2 stricter than risk_api | Accepted. Rule 4 added; rule 2 marked deliberate |
| — | Below bar: S10 section-prefixed folder, `.json` file ids, 400 vs 409, no-op delete; S11 "new folder" contradicts "as the seed" | S10 now defers to barra's `views_api.py` on status codes and folder shape (one line, removes a claim). S11 drops "new folder". The rest noted, not actioned |

**Owner amendment between rounds 2 and 3:** dev port 5175, app served at `/` instead of barra's
`/flexagg2++/` (§3). Folded into S1, S2, S7 smoke, S11, S12, §7.

**Round 2 — input: the document itself (internal consistency). Verdict NOT YET, 7 findings.**

| # | Finding | Disposition |
|---|---|---|
| 1 | S7 gate / §7 item 6 grep can never pass (router's own `"/pivot"`; `/views` half) | Accepted. Grep scoped to `src/api src/ap src/pivot`; views URLs asserted by S11's test |
| 2 | `ApError` constructor unspecified; S7 constructs it | Accepted. S2 states the constructor |
| 3 | `fetchMembers` would have to write MDX outside `mdx.ts` | Accepted. S8 builds it with `buildMdx` + `cellsetToRecords` |
| 4 | Rule 1 "fires on every query" with >1 manager loaded; proposed: fire only when Manager not filtered to one | Fix rejected: risk_api refuses these three on every multi-manager query, filtered or not (round 1 source check), so the proposal would be weaker than risk_api. Rule 1 now says so in one line |
| 5 | Stale owners: table says bindings S8 / store S10; S6 calls `Bindings` a stub | Accepted. Table S7/S9; `Bindings` defined and kept in `guards.ts` |
| 6 | S7 never says to wait for rules; `nonEmpty` unspecified | Accepted. S7: `enabled` on rules; `nonEmpty` always true |
| 7 | S8 FAIL catches S7's hard-coded default row | Accepted. `DEFAULT_ROWS` in `bindings.ts` |
| — | Below bar: S12 gate on long-running servers; IMPORTS gaps; `/meta` values vs AP single-part paths unprobed | Noted, not actioned. The `/meta` point is covered by the S7 live smoke |

**Round 3 — input: source (seed, risk_api live, :9095 live). Verdict NOT YET, 3 findings.** S1, the context
fold (every `/meta` value is a one-part path: 126 dates, 123 managers, 7 sets), the measure lists, and the
result shapes were all confirmed sound.

| # | Finding | Disposition |
|---|---|---|
| 1 | `memberKey`'s `[ALL].[AllMember]` form 400s on the four slicing hierarchies (Units, StressShock, CorrStress, ScenarioDay); breaks the default dollar view | Accepted; orchestrator re-checked live. `ApQuery.slicing`; slicing members written `[d].[h].[level].[p]`; S4 test (l); S5 drops `AllMember` only if present; S3 states depth |
| 2 | S8: FieldList's `scenCtx`/`dayCtx` warnings use short names, and S8's FAIL rule traps any rewrite | Accepted. S8 deletes them; S6 guards own the rules |
| 3 | S7 leaves PivotGrid unchanged, so headers show bracketed keys and `␞` paths | Accepted. PivotGrid (+ test) into S7 with a `captions` prop; S5 review Q3 narrowed |
| — | Below bar: FieldList chips show raw keys; 4 MDX calls when only `per_row` is needed; col/row level sharing a hierarchy | Noted, not actioned |

**Loop closed at the cap (3).** Round 3 still found new criteria (slicing hierarchies), so the plan did not
converge; per §2a the run dispatches and lets the steps find the rest. **The round-3 fold-ins are unreviewed
text**: the S4 (deep), S5, S7 and S8 reviewers are told so and check them first.

## 9. DECISIONS-OPEN

(Empty at start.) Pre-noted for the owner, not blocking:

- ActivePivot on :9095 listens on all interfaces and grants anonymous ROLE_ADMIN (it accepted a content
  write and delete on 2026-10-03). That is a barra_poc setting, outside this plan.

- S1: `.gitignore` is barra's frontend content plus this repo's existing `tmp/` line (kept).
- S1: `vite.config.ts` proxy target reads `env.RISK_API_URL` with fallback `http://127.0.0.1:8010` (uses the
  `loadEnv` result the step prescribes; default equals barra's hardcoded target).
- S1: `hooks.ts` keeps `useMeta`, `useDims`, `useWhatif` (+ `Trade`), because `routes/Pivot.tsx` imports
  `useWhatif`; `types.ts` keeps the 15 types those files, the views API and the kept tests import.
- S2: the proxy key is the regex `^/ap/` (rewrite `^/ap/` -> `/`), not the bare prefix `/ap`, because a bare
  `/ap` key also matches `/api/...` and would depend on key order.
- S2: `RawDiscovery` holds only `catalogs[].{name, cubes[].name}` (the live facts name no discovery fields
  beyond catalog and cube); S3 widens it when it types the model.
- S2: error trimming falls back to the code-stripped text, then `HTTP <status>`, so a message is never "".
  Error bodies with an empty or absent `errorChain` give `HTTP <status>`.

- Amendment 2026-10-03 (orchestrator, from S2's report): S3's file set gains EXTEND `src/ap/client.ts`. S2 typed
  `RawDiscovery` with only catalog and cube names (the live facts list nothing more), so S3 widens it to the
  fields it reads. `client.ts` stays the single owner of the raw types.

- S3: `MeasureInfo.formatString` is `""` when discovery omits it (some hidden measures); the `Raw*` types in
  `client.ts` mark it optional.
- S3: `toCubeModel` searches all catalogs for the cube name; `CubeModel.slicing` lists every non-`ALL` level of
  every slicing hierarchy except `Epoch` (4 on this cube, one level each). Hierarchies with `visible: false`
  (e.g. `PositionRank`) are kept in `levels`; the field list decides what to show.
- S3: fixture drops `defaultMembers`, `contextValues`, `dimensions[].type` is kept as live; measures cut to 15
  (3 hidden, one without `formatString`).
- S4: `buildMdx` cannot know level depth (no CubeModel), so for several levels of one hierarchy on an axis the
  LAST one in the caller's order is the deepest (the drill sends Country then Sector). Callers must order
  shallow to deep. Hierarchies keep first-seen order on the axis.
- S4: two filters on levels of one hierarchy throw `two filters on one hierarchy: [d].[h]`; a filter with an
  empty member list is ignored; a slicing-level member whose path has more than one part throws.
- S4: MDX shape: `CrossJoin(a, b)` nested left to right; first filter is the innermost sub-select; WHERE
  tuples keep filter key order. Live: `[Positions].[Manager].[Manager].Members` on rows returns HTTP 400
  even hand-written with one measure (other hierarchies 200); not an S4 shape issue, S7 should look.

- Amendment 2026-10-03 (orchestrator): S4b inserted from S4's deep review (IMPORTANT 1–4 and two advisories).
  `ApQuery` gains `depth`; S5 reads level depth from `q.depth`; S7 fills it from `CubeModel` beside `slicing`.
  S7 note from the same review: a second drill must replace the parent filter on that hierarchy (the child's full
  path already carries it), since two filters on one hierarchy throw.
- S4b: depth is looked up by the key exactly as given in `rows`/`cols` (not normalised); a missing entry throws
  `no depth for <key as given>`. Equal depths keep the first given. The empty-name check lives in `memberKey`
  (so it covers filters of every form), `hierarchy on two axes` is checked in `buildMdx` after axis reduction.
- S4b: `parseLevelKey` -> `levelKey` is idempotent for any valid key, so normalising in `memberKey` changes no
  output; it now serves as validation (a malformed key throws `bad level key` from `memberKey` itself).
- S5: one record per (row position x distinct col-level member combination), all measures in it (tidy /pivot
  shape; the column axis has measures outermost, so one record per raw column position would split a record
  across measures). Measures and hierarchies are found by the axis `hierarchies` names, not by order. A
  measure or hierarchy in the cellset that `q` did not ask for throws. No rows axis (grand/per_col) = one
  virtual row. `toPivotResult` calls the adapter with `cols: []` for `perRow`, `rows: []` for `perCol`, both
  empty for `grand`; `grand` is `{measure: number|null}` over `q.measures`. A string cell value passes through.

- S6: `Bindings` has no DaySet/PriceSet keys, so rule 4 matches those hierarchies by hierarchy name
  (`DaySet`, `PriceSet`) via `parseLevelKey`; Manager/Date/ScenarioSet match by hierarchy (dim+hier) of the bound key.
- S6: rule 4 stays quiet when DaySet/PriceSet is on an axis as well as when filtered (risk_api's `day_ctx`/`price_ctx`
  accept both; the step text says "filter" only). Rule 2 follows the step text (axis or exactly one filter member),
  stricter than risk_api. Rule 3 adds no filter when `latestDate` is null. An empty-list Date filter counts as unfiltered
  and is replaced.
- S6: `useGuardRules` returns null until both `/dims` and `/meta` load (S7 must wait on null); a `/meta` without
  `managers` is treated as multi-manager (refuse over wrong numbers). `checkQuery` returns a new query, never mutates.

- S7: `fetchPivotLevel`'s args gain `slicing` and `depth` (orchestrator-approved); `pivotSource.ts` also exports
  `makeArgs(model, {rows, cols, measures, filters, totals, rowTot})` which fills `cube`, `slicing`, `depth` from the
  CubeModel, so usePivot and ChartMode never spell them.
- S7: totals. `per_col` is asked only when `totals` and a col dim exist, `per_row` only when `rowTot` and a col dim
  exist, `grand` when `totals` (with no col dim `per_col` would equal `grand` and `per_row` the body). Totals + col dim +
  rowTot = the plan's 4 MDX calls; totals alone = 2.
- S7: usePivot's base query now carries its margins in the SAME `fetchPivotLevel` call (`totals: cfg.totals`), where
  the old code made a second `/pivot` call for the Total row. The drill passes `totals: false`. One call site builds the
  args (`queryLevel`); fewer cube queries, same cube-computed margins.
- S7: `usePivot(initial, {model, rules})`: either null makes `reload` and `toggleExpand` return without fetching or
  setting an error (wait). Units: usePivot adds `[Units].[Units].[Units]: ["$"]` to the QUERY filters (never to
  `cfg.filters`, which saved views keep); `fetchPivotLevel` reads that filter to set `units`/`dollar_measures`.
- S7: `mergeFilters` makes each drill path entry REPLACE every other filter on its hierarchy (the parent's, and also a
  user filter on another level of it); the deepest path entry wins. The user's shallower/deeper filter on that hierarchy
  is lost for the drilled subtree (buildMdx refuses two filters on one).
- S7: context fold in `Pivot.tsx`: a filter on Manager/Date/ScenarioSet that differs from the context value last folded
  is the user's own and wins (a loaded view's Date survives a scenario change); before, context overwrote it. Manager is
  now part of the folded context (`contextFilters`), as the step text says. `checkBindings(model)` non-empty shows an
  error line and runs nothing.
- S7: ChartMode takes `model` and `rules` props (Pivot passes them) and waits on null. Records are re-keyed
  `f0..fN` in the order rows, cols, measures; a level's value is its label. Saved chart specs authored against the old
  short names do not bind until their views are migrated (S11 or later); the builder charts f0 vs the measure alias,
  titled with the level caption and the measure name.
- S7: PivotGrid exports `labelHeader` and `valueHeader`; a level with no caption shows its level name, a column member
  with no caption shows the last part of its path. FieldList (S8) still offers `/dims` short names, so until S8 adding a
  field there fails with `bad level key`/`no depth`, and its filter chips show level keys.
- S7 FINDING (not fixed, `src/ap/mdx.ts` is not in S7's file set): `memberKey` builds the member as
  `[d].[h].[l].[ALL].[AllMember].[x]` and AP answers HTTP 400 to every filter in that form. Live probe 2026-10-03:
  `[d].[h].[ALL].[AllMember].[x]` (hierarchy, not level, before `[ALL]`) returns 200 for Manager, Date and ScenarioSet;
  the slicing short form `[Units].[Units].[Units].[$]` is fine. With the form rewritten in flight, S7's live smoke
  passes 5/5; unrewritten it fails 5/5. Needs an S4c amendment (mdx.ts + mdx.test.ts) before S7's live run.

- Amendment 2026-10-03 (orchestrator): S4c inserted from S7's report. S4's `memberKey` put the level name before
  `[ALL]`, against S4's own text; ActivePivot 400s on it. S4c lands before S7's commit (disjoint files).
- S4c (done, unstaged): `memberKey` writes the hierarchy form via the existing `hierKey` (made a hoisted function so
  `memberKey` can call it). Live probe, 4 shapes (Date WHERE, two-Country sub-select with Country on rows, Sector path
  with Sector on rows, Units `$`): 200 x4. One S7 test (`pivotSource.test.ts`, "a guard notice ends up in warning...")
  asserts the old Date form and now fails; it is S7's fix, untouched here.

- S8 (unstaged, BLOCKED on one file): `fetchMembers(model, levelKey, signal?)` takes the CubeModel first (the plan's
  `fetchMembers(levelKey)` cannot know cube, slicing or depth); it builds `ApQuery` through `makeArgs`. `FieldList`
  drops its `dims` prop (nothing reads `/dims` there now) and reads `useCubeModel()`; Pivot.tsx stops passing it.
  Hidden hierarchies' levels are listed (LevelInfo has no `visible`); hidden measures are not. A filter chip shows the
  cached member label, else the last path part. `src/routes/Pivot.test.tsx` (not in S8's file set) asserts two chips
  as `${SCEN}=HistFull` / `${DATE}=2024-11-30` / `${MGR}=Soros`; with captions they read `ScenarioSet=HistFull` etc.
  Needs an amendment adding that file (2 tests fail until its expectations move to captions).

- Amendment 2026-10-03 (orchestrator, from S8's report): S8's file set gains EXTEND `src/routes/Pivot.test.tsx`
  (three filter-chip expectations move from bracketed keys to captions). `fetchMembers` takes `(model, levelKey,
  signal?)`: cube, slicing and depth come from the `CubeModel` (S4b made them required).
- Open for the owner (S8): with a binding missing, S7's Pivot.tsx shows the missing-levels line and runs nothing;
  the plan said "the pivot still works without the context". Kept S7's stricter behaviour (no unguarded query).
- S9: `file` ids carry no `.json` suffix (`Public/Risk/slug`), per the step text; barra's carried one. S10 and the
  frontend must not append it. `path` on a leaf and in a ViewDoc is `<section>/<folder>` as in barra.
- S9: folder arguments are relative to the section (`""` = section root). `parse_file(file)` is added so S10 can
  split a `file` id into `(section, folder, slug)` with every segment checked.
- S9: missing view or folder raises `FileNotFoundError` (S10: 404); bad section, path, clash or non-empty folder
  raises `ValueError` (S10: 400). Barra raised `ValueError` for a missing folder.
- S9: `move_view` and `rename_view` refuse to overwrite an existing view (`ValueError`); barra overwrote silently.
  `rename_folder` refuses an existing target. `save` into a missing folder creates it and its ancestors (as barra).
- S9: segments reject empty/blank, `.`, `..`, `/`, `\` and control characters; unicode look-alikes are accepted as
  plain characters (rows, not paths, so they reach nothing). `make_folder` rejects rather than sanitises a name
  (barra's `folder_name` replaced separators with a space).
- S9: `delete_view` is idempotent (as barra). `schema_version` is the constant 2 emitted on load, not a stored column.
- S9: one connection behind an RLock, `BEGIN IMMEDIATE` per write, so FastAPI's threadpool is safe.

- Amendment 2026-10-03 (orchestrator): S9b inserted from S9's deep review (COMMIT outside try wedges the
  connection when a second connection holds a lock). S10 should open the store once and close it on shutdown.
- S9b (implementer): the test sets the short busy timeout with `PRAGMA busy_timeout=50` on the store's connection
  rather than adding a constructor parameter ("Nothing else changes"); WAL not enabled (optional in the review,
  changes the on-disk mode). `close()` is idempotent (sqlite3 close twice is a no-op); use after close raises
  `sqlite3.ProgrammingError`.
- S10: app factory `create_app(db_path=None)` plus module-level `app = create_app()` for uvicorn; the store opens in
  the lifespan (import touches no disk) and closes on shutdown. DB: argument, else env `VIEWS_DB`, else
  `<repo>/data/views.db` (data/ is gitignored).
- S10: an incoming file id with a `.json` suffix is accepted and stripped (barra's ids had one; a slug cannot end in
  `.json`). Responses never carry it. Delete echoes the id as the client sent it, as barra did.
- S10: `folder`, `parent`, `to_folder`, `rel` carry the section prefix as in barra; `""` is 400 (barra required a section).
  A trailing or doubled slash is 400. Move across sections is 400.
- S10: status codes: FileNotFoundError 404, ValueError 400, `sqlite3.OperationalError` (lock timeout) 503. Barra
  mapped no 404 for folder rename/delete (missing folder was a no-op or 400); here a missing folder is 404, and
  delete/rename of a section root is 400. Move/rename onto an existing view is 400 (S9 refuses; barra overwrote).
- S10: handlers are sync `def` (threadpool); the store's RLock serialises them.

## 10. As built

(Written from the tracker at the end.)
