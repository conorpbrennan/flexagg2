STEP: S11 (fix round 2, pre-review: amended file set)
GATE:
- `npx tsc -b`: exit 0.
- `npx vitest run`: exit 0, 21 files, 188 tests (route files 10/10).
- `.venv/bin/python -m pytest -q server/tests`: 91 passed, 1 warning.
- `grep -rn '/api/views' src`: no runtime call (Repository.tsx:5 is the import path "../api/views"; the rest are comments/tests asserting absence: views.test.ts 1, 32, 38; Repository.test.tsx 55).
RED FIRST: 5 route tests failed; first assertion `waitFor(() => expect(screen.getByText("Date=2024-11-30")).toBeInTheDocument())` at Pivot.test.tsx:199 timed out (v1 fixture refused). After the schema_version edit 2 still failed: "Unable to find an element with the text: HistFull" and "expected [ '2024-12-31' ] to deeply equal [ '2024-11-30' ]" — the fixture measure "Risk HHI" is not in the discovery model, so fitToModel dropped it and the pivot never re-queried.
FILES: Pivot.rejection.test.tsx:48 schema_version 1 -> 2; Pivot.test.tsx:51 schema_version 1 -> 2; Pivot.test.tsx:52 HHI_VIEW measures ["Risk HHI"] -> ["Scenario VaR 99"] (orchestrator decision); Pivot.test.tsx:67 mock record keys "Risk HHI" -> "Scenario VaR 99" (same values). View display name and DIMS strings left. No assertion weakened or removed; discovery fixture untouched.
DISAGREEMENTS: none (fixture level keys survive fitToModel; only the measure was dropped).
DECISIONS: measure swap (orchestrator); no route-level v1 test (Repository.test.tsx 63-71 covers it).
MEASUREMENTS: route tests 5 failed -> 0; suite 188/188.
NEXT: review S11.
