# Review And Tests

**Requirement**: Review the entire code base, fix what the review confirms test-first, add tests where coverage is missing, and delete dead code.

**Started**: 2026-10-05
**Last updated**: 2026-10-05
**Branch**: review-and-tests

## Files involved

- package-lock.json
- package.json
- server/tests/test_views_api.py
- server/tests/test_views_store.py
- server/views_store.py
- src/App.test.tsx
- src/App.tsx
- src/ap/cellset.test.ts
- src/ap/client.test.ts
- src/ap/client.ts
- src/ap/discovery.test.ts
- src/api/client.test.ts
- src/api/hooks.test.tsx
- src/api/hooks.ts
- src/api/stream.test.ts
- src/api/stream.ts
- src/api/types.ts
- src/api/views.test.ts
- src/api/views.ts
- src/components/LineChart.tsx
- src/components/Markdown.tsx
- src/components/StreamPanel.tsx
- src/components/svg.test.tsx
- src/components/svg.tsx
- src/components/ui.test.tsx
- src/context/AppContext.test.tsx
- src/context/AppContext.tsx
- src/lib/format.test.ts
- src/pivot/ChartMode.test.tsx
- src/pivot/ChartMode.tsx
- src/pivot/FieldList.test.tsx
- src/pivot/FieldList.tsx
- src/pivot/PivotGrid.render.test.tsx
- src/pivot/Repository.test.tsx
- src/pivot/Repository.tsx
- src/pivot/usePivot.test.ts
- src/pivot/usePivot.ts
- src/routes/Pivot.test.tsx
- src/routes/Pivot.tsx
- src/routes/paths.ts
- src/shell/ContextBar.test.tsx

## History

- 2026-10-05 `24bb21d` — test: cover the untested frontend paths; fix ScenarioSet surviving on an axis
  - server/tests/test_views_store.py
  - src/ap/cellset.test.ts
  - src/ap/discovery.test.ts
  - src/api/client.test.ts
  - src/components/ui.test.tsx
  - src/lib/format.test.ts
  - src/pivot/ChartMode.test.tsx
  - src/pivot/FieldList.test.tsx
  - src/pivot/PivotGrid.render.test.tsx
  - src/pivot/Repository.test.tsx
  - src/routes/Pivot.test.tsx
  - src/routes/Pivot.tsx
  - src/shell/ContextBar.test.tsx

- 2026-10-05 `cccd933` — fix(AppContext): / and unknown paths redirect to /pivot again
  - src/App.test.tsx
  - src/App.tsx
  - src/context/AppContext.test.tsx
  - src/context/AppContext.tsx
  - src/routes/paths.ts

- 2026-10-05 `7586e09` — fix(ap/client): keep the meaning of ActivePivot error messages
  - src/ap/client.test.ts
  - src/ap/client.ts

- 2026-10-05 `bbcf962` — fix(ChartMode): chart queries carry the same Units context as the grid
  - src/pivot/ChartMode.test.tsx
  - src/pivot/ChartMode.tsx
  - src/pivot/usePivot.ts

- 2026-10-05 `dcd3907` — fix(views_store): store schema_version per view instead of stamping it on load
  - server/tests/test_views_api.py
  - server/tests/test_views_store.py
  - server/views_store.py

- 2026-10-05 `cf96b41` — fix(views): saved views follow the context; missing fields stay missing; ids URL-encoded
  - src/api/views.test.ts
  - src/api/views.ts
  - src/pivot/Repository.test.tsx
  - src/pivot/Repository.tsx
  - src/routes/Pivot.test.tsx
  - src/routes/Pivot.tsx

- 2026-10-05 `a28b4e8` — fix(FieldList): picker resets per level; an empty filter list no longer crashes
  - src/pivot/FieldList.test.tsx
  - src/pivot/FieldList.tsx

- 2026-10-05 `6253456` — fix(usePivot): stale responses never overwrite newer ones; drill from the applied config
  - src/pivot/usePivot.test.ts
  - src/pivot/usePivot.ts

- 2026-10-05 `e14f6da` — chore: remove UI code orphaned by the ActivePivot switch; test the risk_api hooks
  - package-lock.json
  - package.json
  - src/api/hooks.test.tsx
  - src/api/stream.test.ts
  - src/api/stream.ts
  - src/components/LineChart.tsx
  - src/components/Markdown.tsx
  - src/components/StreamPanel.tsx
  - src/components/svg.test.tsx
  - src/components/svg.tsx
