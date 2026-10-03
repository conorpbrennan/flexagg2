STEP: S7 (fix round 2, pre-review: close S7's own old-form test after S4c)
GATE:
- `npx tsc -b`: exit 0.
- `npx vitest run`: exit 0, 18 files, 168 tests.
- `grep -rn '"/pivot"' src/api src/ap src/pivot`: nothing.
- apMdx: only non-test call src/ap/pivotSource.ts:55.
- `grep -rn "\]\.\[ALL\]" src`: the only level-form pin was pivotSource.test.ts:158 (now fixed).
- Live smoke NOFIX=1 (no member rewrite): 5/5 PASS — bindings missing 0; factor rows + totals 3 records; units $ 3 records units=dollar; col dim + both totals 24 records, per_row 3, per_col 8; scenario VaR 3 records, grand 2 entries; manager rows no date 124 records all numeric, warning=yes (guard added latest date).
- Live drill NOFIX=1: FactorGroup level 3 records; drill to next level of the same hierarchy filtered to the first row's member: PASS, 11 records.
RED FIRST: before the fix, pivotSource.test.ts "a guard notice ends up in warning, and the added Date filter reaches every MDX" failed: expected `[Exposures].[Date].[Date].[ALL].[AllMember].[2026-06-30]`, received `[Exposures].[Date].[ALL].[AllMember].[2026-06-30]`.
FILES: src/ap/pivotSource.test.ts line 158 only.
DISAGREEMENTS: none. DECISIONS: none.
BUDGET USED: 1 test edit, 1 red run, 1 gate run, 2 live runs.
NEXT: review S7.
