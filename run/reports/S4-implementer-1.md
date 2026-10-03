STEP: S4
GATE:
- `npx tsc -b` -> exit 0
- `npx vitest run` -> exit 0, 14 files, 82 tests (23 in mdx.test.ts)
- Live check (status codes only), buildMdx output sent to :9095: 200 for Country+Sector rows; Country rows x Date cols; Units `$` WHERE; Date rows with two-member Units sub-select; FirmType rows; ScenarioSet rows; Country+Date rows with Units `$` WHERE. 400 for any query with `[Positions].[Manager].[Manager].Members` on rows (hand-written too).
RED FIRST: mdx.test.ts written first; `npx vitest run src/ap/mdx.test.ts` -> "Test Files 1 failed (1) / Tests no tests", vite transform error because `./mdx` does not exist.
FILES: NEW src/ap/mdx.ts, NEW src/ap/mdx.test.ts (declared set). Plan §9 entries (always permitted).
DISAGREEMENTS:
- S4 says "only the deepest goes on the axis" but buildMdx gets no depth; used the last level given (see decisions).
- Live: Manager level on rows returns 400. ORCHESTRATOR FOLLOW-UP: root cause in the stack trace is `CancellationException: A retrieval exceeded the limit` — an unfiltered all-managers query is too large (with contributors.COUNT it returns 200). A server retrieval limit, not an MDX shape problem.
- memberKey slicing form and test (l) agree with live (Units `$` WHERE 200). Test (j) asserts the full string where the spec only names the axis level.
DECISIONS THE PLAN LEFT OPEN (also in §9):
- Deepest level of a hierarchy = the LAST in the caller's order (depth not in ApQuery). Hierarchies keep first-seen order on the axis.
- Two filters on levels of one hierarchy throw `two filters on one hierarchy: [d].[h]`.
- A filter with an empty member list is ignored. A slicing-level member with more than one path part throws.
- Output shape: `CrossJoin(a, b)` nested left to right; columns `CrossJoin({measures}, cols...)`; first filter is the innermost sub-select; WHERE tuples keep filter key order.
- Level keys re-normalised through parseLevelKey+levelKey; cube and measure names through esc.
MEASUREMENTS: 23 tests in mdx.test.ts, 82 in suite. 7 live queries 200, 4 Manager-on-rows 400. Scratch scripts in scratchpad (npx tsx, not in package.json).
BUDGET USED: ~12 min (wall clock ~7 min), one pass.
NEXT:
- S5 axis order: COLUMNS is axis 0, measures outermost then col levels. ROWS is axis 1, one set per hierarchy, in first-appearance order in `rows`. Shallower levels of a hierarchy are not on the axis; S5 fills them from namePath.
- Member values are path strings (`pathKey`/`splitPath`, U+241E), the namePath below AllMember.
- S7 callers must order levels of one hierarchy shallow to deep. Manager-on-rows without date/manager filters exceeds AP's retrieval limit; S7's context filters (date) avoid it.
- Empty `rows` -> no ROWS clause; no cols and no rows -> COLUMNS only.
