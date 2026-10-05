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
- src/pivot/FieldList.test.tsx
- src/pivot/FieldList.tsx
- src/pivot/Repository.test.tsx
- src/pivot/Repository.tsx
- src/pivot/usePivot.test.ts
- src/pivot/usePivot.ts
- src/routes/Pivot.test.tsx
- src/routes/Pivot.tsx

## History

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
