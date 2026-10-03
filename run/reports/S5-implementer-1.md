STEP: S5
GATE:
- `npx tsc -b` -> exit 0
- `npx vitest run` -> exit 0, 15 files, 108 tests
RED FIRST: `npx vitest run src/ap/cellset.test.ts` before cellset.ts existed -> `Error: Failed to resolve import "./cellset" from "src/ap/cellset.test.ts". Does the file exist?`. A second red during implementation: "unexpected hierarchy" checked before "hierarchy missing" failed the missing-hierarchy test; checks reordered.
FILES: src/ap/cellset.ts, src/ap/cellset.test.ts, src/ap/__fixtures__/cellset-rows.json, src/ap/__fixtures__/cellset-rows-cols.json (declared set). Plan §9 bullet (always permitted). usePivot.ts and api/types.ts untouched.
DISAGREEMENTS:
1. "one record per (row position x col position)": the column axis is CrossJoin(measures, col levels), so a raw column position carries one measure; read literally that gives one-measure records, not the tidy /pivot shape `rowsFromRecords` reads. Built one record per (row position x distinct col-level member combination) with all measures. With no col levels this equals the literal reading. Recorded in §9.
2. depth read from `q.depth`; "drop AllMember only when present, cut at depth" confirmed live (Date namePath [AllMember, <date>]; Units namePath [Base], no AllMember).
3. `RawAxis.hierarchies` is `unknown[]`; live each entry is {dimension, hierarchy, levelNames}. Positions matched to levels by those names (narrowed at runtime in cellset.ts). client.ts untouched.
DECISIONS THE PLAN LEFT OPEN (in §9):
- Hierarchy and measure lookup by axis `hierarchies` names, never order.
- Exact-message throws: `unexpected hierarchy on <rows|columns> axis: <h>`, `hierarchy missing from <rows|columns> axis: <h>`, `unexpected measure: <m>`, `path too short for <key>`, `no depth for <key>`.
- Rows axis absent (no ON ROWS -> no axis 1 live): one virtual row; if q has row levels but no axis -> `no rows axis in cellset`.
- toPivotResult: perRow with cols [], perCol with rows [], grand with both empty; grand `{measure: number|null}` over q.measures; `totals` true when any of perRow/perCol/grand given.
- String cell value passes through (Rec allows it); other non-number -> null.
- Label = captionPath[depth-1], falling back to the name.
- `labelKey` exported from cellset.ts.
MEASUREMENTS: vitest 15 files / 108 tests. Live probes: Measures+Units column axis -> 2 hierarchies per position; Date rows namePath length 2; no-ROWS query returns only axis 0. No real values or member names copied.
BUDGET USED: under 25 min / 1 round.
NEXT:
- S7 passes `q.depth` for every rows/cols key; may reuse the same q for per_row/per_col/grand; toPivotResult strips the irrelevant axis itself.
- per_row needs rows-only MDX, per_col cols-only MDX, grand neither (else col-level keys leak into per_row records).
- Record keys: levelKey as given and `levelKey#label`. Nested level value is a pathKey string (`UK<SEP>Energy`); grid needs splitPath for nested row levels and #label for header captions (S7).
- Under NON EMPTY a column combination can lack some measures -> null, never filled or summed.
