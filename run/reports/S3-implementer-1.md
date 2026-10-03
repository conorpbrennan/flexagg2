STEP: S3
GATE:
- `npx tsc -b` -> exit 0
- `npx vitest run` -> exit 0, 13 files, 59 tests passed
- `node -e "JSON.parse(require('fs').readFileSync('src/ap/__fixtures__/discovery.json'))"` -> exit 0
RED FIRST: `npx vitest run src/ap/discovery.test.ts` before implementation: `Error: Failed to resolve import "./discovery" from "src/ap/discovery.test.ts". Does the file exist?` (suite failed, 0 tests). Assertions: Securities levels Country, Sector, Issuer, Position depth 1..4; no ALL level, no Epoch; Units is slicing; 4 slicing keys; levelKey/parseLevelKey round-trip names holding `]`, `[`, `.`; malformed keys throw; unknown cube throws `cube Nope not in discovery`; hidden measures kept; missing formatString -> "".
FILES: src/ap/discovery.ts (new), src/ap/discovery.test.ts (new), src/ap/__fixtures__/discovery.json (new), src/ap/client.ts (EXTEND: RawLevel, RawHierarchy, RawDimension, RawMeasure, RawCube). Matches the declared set incl. the 2026-10-03 amendment. Plan §9 entries (always permitted).
DISAGREEMENTS: none with the amendment. Fixture has exactly 15 measures, 3 hidden; one hidden (update.TIMESTAMP) has no formatString, as live.
DECISIONS THE PLAN LEFT OPEN (also in plan §9):
- MeasureInfo.formatString is "" when discovery omits it (RawMeasure.formatString optional).
- toCubeModel searches all catalogs for the cube name (one catalog live).
- CubeModel.slicing = every non-ALL level of every slicing hierarchy except Epoch; live 4 (StressShock, CorrStress, Units, ScenarioDay), one level each.
- Hierarchies with `visible: false` (e.g. PositionRank) kept in `levels`.
- Epoch excluded by dimension name; its level Branch sits in a slicing hierarchy, so also excluded from `slicing`.
- Fixture: catalogs[0].cubes[0] name, caption, all 14 dimensions with hierarchies and levels as live, 15 measures. Dropped defaultMembers, contextValues, kpis, sets, measureGroups. No manager names or holdings in discovery; no names replaced; no cell values.
MEASUREMENTS: live discovery 1 catalog, 1 cube, 14 dimensions, 175 measures (curl + python). Fixture 15 measures, 3 hidden, 12807 bytes. Securities 4 non-ALL levels; 4 slicing keys. Suite 13 files / 59 tests.
BUDGET USED: within 20 min, 1 round.
NEXT:
- `levelKey`/`parseLevelKey` exported from src/ap/discovery.ts; level keys escape `]` as `]]` inside each part, same as MDX.
- `LevelInfo` has `dim`, `hier`, `level` as separate fields; S4 need not parse keys.
- `useCubeModel()` (queryKey ["ap","discovery"], staleTime Infinity) needs a QueryClientProvider.
- `RawLevel.type` is a plain string; only "ALL" is read. Live types include REGULAR, TIME.
- Hidden measures are in `model.measures` with `visible: false`; 86 of 175 live are visible.
