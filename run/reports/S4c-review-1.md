Reviewer: code-reviewer-deep, round 1. Verdict: PASS. Critical 0, important 0, advisory 3.
- Gate in worktree (HEAD+S4c): tsc -b 0; vitest 16 files / 128 tests.
- Red confirmed: new mdx.test.ts against HEAD's mdx.ts -> 12 fail / 21 pass, as claimed.
- Live probe (buildMdx from worktree, model from live discovery, names read at runtime, not printed): Date WHERE, 2-Country sub-select, Sector path filter on Sector rows, Units $, drill (Country+Sector rows, Country filter), drill nonEmpty:false, Date WHERE nonEmpty:false, two nested filtered hierarchies, off-axis Sector WHERE + Units $ — all 200 with non-empty cellsets. Control: old level form 400.
- Q1: no level-form member writer remains (only mdx.ts:32 writes [ALL].[AllMember]).
- Q2: removed lines map exactly to added lines under the spelling change; only new test (s3) added.
- S4c block correct.
Advisory: const->function hierKey change unnecessary (stated reason wrong; harmless); level key parsed twice (negligible); S4c gate wording "suite must still pass with S7's work" contradicts the known S7 red test — S7 must fix it before its commit.
TDD_GATE: PASS
