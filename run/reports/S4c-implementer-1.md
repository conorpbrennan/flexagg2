STEP: S4c
GATE:
- `npx tsc -b` -> exit 0.
- `npx vitest run` (with S7's unstaged work in the tree) -> exit 1: 167 of 168 pass. The one failure is S7's src/ap/pivotSource.test.ts "fetchPivotLevel > a guard notice ends up in warning, and the added Date filter reaches every MDX", which expects the old level-form Date member. Not edited (S7's file). mdx.test.ts passes in full. On HEAD+S4c alone (review worktree) the suite is the one that counts.
- Live probe (scratch s4c-probe.mts outside the repo; status codes only): date WHERE 200; two-country sub-select with Country on rows 200; Sector path filter with Sector on rows 200; Units $ 200.
- `grep -rn "\[ALL\]" src` outside tests: only mdx.ts comment and the hierarchy form.
- Only member spellings changed in existing expected strings. `grep -cF 'replace(/\]/g' src/ap/mdx.ts` prints 0.
RED FIRST: mdx.test.ts edited first; against S4b's code 12 tests failed, e.g. (s3) "the level name never sits before [ALL]: the level form is a 400 live" expected "[Securities].[Security].[ALL].[AllMember].[UK]", received "[Securities].[Security].[Country].[ALL].[AllMember].[UK]"; (s) expected "[D]]].[H].[ALL].[AllMember].[m]", received the level form; plus (d), (e), (f), (i), (j2), (k), (p), two nested-hierarchy tests, two-WHERE tuple, full-path test.
FILES: src/ap/mdx.ts, src/ap/mdx.test.ts, plan §9. Matches declared set. No S7 file touched.
DISAGREEMENTS:
- IMPORTS named parseLevelKey, esc: reused mdx.ts's private hierKey (dim+hier through esc), made a hoisted function. No new import.
- S7's pivotSource.test.ts asserts the old Date member form and now fails (to be fixed in S7).
DECISIONS THE PLAN LEFT OPEN (in §9): reuse hierKey (one escaping path); test (s) asserts the hierarchy form.
MEASUREMENTS: red 12 failing; full suite with S7 167 pass / 1 fail; probes 200 x4.
BUDGET USED: well inside 10 min, 1 round.
NEXT:
- S7 fixes src/ap/pivotSource.test.ts expected Date member to `[Exposures].[Date].[ALL].[AllMember].[2026-06-30]`.
- S7's live smoke should pass with NOFIX=1.
