Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 2.
- Gate in worktree: tsc -b 0; vitest 18 files / 168 tests; "/pivot" grep empty; apMdx only called in src/ap/pivotSource.ts. Live smoke not re-run.
- Q1: margins are separate cube queries (Promise.all); no browser sum; test "totals come from the same fetch: grand, per_col and per_row, never summed".
- Q2: "expand issues one query for the next level, filtered to the parent path" kept; "a second drill replaces the parent filter on the same hierarchy" added; mergeFilters tested.
- Q3: no test deleted; three rewordings — rowsFromRecords stronger, col-spread renamed only, rejection test slightly looser (prefix/tail regex) plus "no MDX sent".
- Q4: the four level-key literals appear only in src/ap/bindings.ts.
- Null rules: usePivot.test "null guard rules means wait: no fetch at all" (rules and model).
- Round-3 captions: labelHeader/valueHeader never show bracketed keys or U+241E paths; column ids and sort keys unchanged.
Advisory: rejection test no longer pins the full message; declared deviations reasonable (drill loses a user filter on the same hierarchy for the subtree; f0..fN re-key; short names fail until S8).
TDD_GATE: PASS
