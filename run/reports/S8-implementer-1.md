STEP: S8 — BLOCKED on one file outside the declared set (src/routes/Pivot.test.tsx); amendment proposed and taken by the orchestrator.
GATE:
- `npx tsc -b` -> exit 0.
- `npx vitest run` -> 2 failed / 176 passed (19 files, 1 failed), both in src/routes/Pivot.test.tsx (not in set): "loading a saved view > updates the Fields section (R/C/F/M)" (lines 148, 155, 156) and "context and guards > a filter the user chose on a context level wins..." (line 197). They expect bracketed chip text (`${SCEN}=HistFull` etc.); chips now read captions (`ScenarioSet=HistFull`). Not edited.
- `npx vitest run src/pivot src/ap` -> 13 files, 150 tests pass.
AMENDMENT PROPOSED: add EXTEND src/routes/Pivot.test.tsx to S8's file set.
RED FIRST: `npx vitest run src/pivot/FieldList.test.tsx src/ap/pivotSource.test.ts` before implementation: pivotSource 3/14 failed, `fetchMembers is not a function` (maps path and label; deeper level's path carries every ancestor; unknown level throws before any call). FieldList.test: every test failed `TypeError: Cannot read properties of undefined (reading 'dimensions')` at FieldList.tsx:127.
FILES: src/pivot/FieldList.test.tsx (new), FieldList.tsx, src/ap/pivotSource.ts, pivotSource.test.ts, src/routes/Pivot.tsx; plan §9. Needed, not in set: src/routes/Pivot.test.tsx. Not touched: ContextBar, AppContext, server/.
DISAGREEMENTS:
1. Plan `fetchMembers(levelKey)`; done `fetchMembers(model, levelKey, signal?)` (cube, slicing, depth from CubeModel).
2. Missing-bindings line already exists from S7 (Pivot.tsx ~177-179); not duplicated. S7 does not run the pivot when bindings are missing; kept (plan said "still works without the context").
3. scenCtx/dayCtx warnings deleted; no disagreement.
4. Pivot.tsx no longer passes `dims` to FieldList.
DECISIONS THE PLAN LEFT OPEN (in §9):
- FieldList drops `dims` prop, reads useCubeModel().
- Hidden hierarchies' levels listed (LevelInfo has no visible); hidden measures not listed.
- Chip shows cached member label if loaded, else last path part; never bracketed key or U+241E. Picker stores full paths.
- Picker shows loading line and error text on failure; no paging, no member search.
- Members query cached staleTime Infinity, key ["ap","members",levelKey].
- A level key the model lacks (old saved view) shows as its last bracket part.
MEASUREMENTS: live discovery 175 measures, 86 visible (curl + node). Fixture 15 measures, 12 visible (test asserts 12). No live fetchMembers call.
BUDGET USED: ~30 min, 1 round, stopped at the amendment.
NEXT:
- Fix Pivot.test.tsx chip expectations (lines 148, 155, 156, 197), rerun full gate.
- Deep levels unfiltered (Position, Issuer) may exceed AP's retrieval limit in the picker; picker shows AP's error. No paging.
- Old saved views/charts/?drill= links with short names need migration (S11 or later).
- Picker members are unfiltered by other filters; contributors.COUNT only drives NON EMPTY.
