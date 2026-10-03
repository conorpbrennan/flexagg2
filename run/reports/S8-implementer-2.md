STEP: S8 (fix round 2: Pivot.test.tsx chip expectations, file set amended)
GATE:
- `npx tsc -b` -> exit 0.
- `npx vitest run` -> exit 0; 19 files, 178 tests (Pivot.test.tsx 9/9; React act stderr noise, no failures).
RED FIRST: `npx vitest run src/routes/Pivot.test.tsx` -> 2 failed, 7 passed: "loading a saved view > updates the Fields section (R/C/F/M)": `Unable to find an element with the text: [Scenarios].[ScenarioSet].[ScenarioSet]=HistFull` (line 148; 155, 156 same form); "context and guards > a filter the user chose on a context level wins...": `Unable to find an element with the text: [Exposures].[Date].[Date]=2024-11-30` (line 197).
Fix: expectations to exact captions — 148 "ScenarioSet=HistFull", 155 "Date=2024-11-30", 156 "Manager=Soros" (made-up test fixture name), 157 queryByText("ScenarioSet=HistFull") still not in document, 197 "Date=2024-11-30". Added: every chip matching /^\w+=/ has no `[` or U+241E.
FILES: src/routes/Pivot.test.tsx (expectations only).
DISAGREEMENTS: none.
DECISIONS: literal caption strings, not derived from BINDINGS.
MEASUREMENTS (live, vite-node scratch script): fetchMembers OK for FactorGroup 3, Country 44, Date 126, ScenarioSet 7, Issuer 4938, Position 5173 members. The agent reported "175 visible measures"; ORCHESTRATOR RE-CHECK: toCubeModel on live discovery gives 175 measures, 86 visible (the agent's script counted all measures). Live discovery itself: 86 visible, 89 hidden.
BUDGET USED: ~8 tool calls.
NEXT: review S8.
