Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 3.
- Gate in worktree: tsc -b 0; vitest 19 files / 178 tests. No level-key literal outside tests; apMdx only in pivotSource.ts; fetchMembers reuses makeArgs/buildMdx/cellsetToRecords; no decorative element.
- Round-3 fold-in: deleting scenCtx/dayCtx leaves no rule unsurfaced (rule 2 rejection on the error line; rule 4 DaySet notice via warning). Behaviour change: guard text appears after a query runs, not live while editing zones.
- Q1: picker stores m.path, label display only; test pins path storage incl. deeper path; chips fall back to last path part.
- Q2: filter box directly above the measure list (sorted, 12rem scroll); zones and dimensions come before it in the panel (acceptable).
- Pivot.test.tsx: chip text only, plus a no-[/U+241E assertion; nothing weakened.
Advisory: Position (5173) / Issuer (4938) pickers unpaged, no member search; missing-binding behaviour is a plan question (open for owner); chip captions read query cache without subscribing (cosmetic).
TDD_GATE: PASS
