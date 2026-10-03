# Activepivot Explorer

**Requirement**: A React/Vite pivot explorer that queries ActivePivot natively (discovery + MDX) and saves views in its own store.

**Started**: 2026-10-03
**Last updated**: 2026-10-03
**Branch**: activepivot-explorer

## Files involved

- .gitignore
- docs/activepivot-ui-plan.md
- index.html
- package-lock.json
- package.json
- run/reports/S1-implementer-1.md
- run/reports/S1-review-1.md
- run/reports/S2-implementer-1.md
- run/reports/S2-review-1.md
- run/reports/S3-implementer-1.md
- run/reports/S3-review-1.md
- run/reports/S4-implementer-1.md
- run/reports/S4-review-1.md
- run/reports/S4b-implementer-1.md
- run/reports/S4b-review-1.md
- run/reports/S4c-implementer-1.md
- run/reports/S5-implementer-1.md
- run/reports/S5-review-1.md
- run/reports/S6-implementer-1.md
- run/reports/S6-review-1.md
- run/tracker.md
- src/App.tsx
- src/ap/__fixtures__/cellset-rows-cols.json
- src/ap/__fixtures__/cellset-rows.json
- src/ap/__fixtures__/discovery.json
- src/ap/cellset.test.ts
- src/ap/cellset.ts
- src/ap/client.test.ts
- src/ap/client.ts
- src/ap/discovery.test.ts
- src/ap/discovery.ts
- src/ap/guards.test.ts
- src/ap/guards.ts
- src/ap/mdx.test.ts
- src/ap/mdx.ts
- src/api/client.ts
- src/api/hooks.ts
- src/api/stream.test.ts
- src/api/stream.ts
- src/api/types.ts
- src/api/views.ts
- src/components/LineChart.tsx
- src/components/Markdown.tsx
- src/components/StreamPanel.tsx
- src/components/svg.test.tsx
- src/components/svg.tsx
- src/components/ui.test.tsx
- src/components/ui.tsx
- src/context/AppContext.tsx
- src/index.css
- src/lib/format.test.ts
- src/lib/format.ts
- src/main.tsx
- src/pivot/ChartMode.test.tsx
- src/pivot/ChartMode.tsx
- src/pivot/FieldList.tsx
- src/pivot/PivotGrid.test.ts
- src/pivot/PivotGrid.tsx
- src/pivot/Repository.tsx
- src/pivot/usePivot.test.ts
- src/pivot/usePivot.ts
- src/pivot/usePivotSort.test.ts
- src/routes/Pivot.rejection.test.tsx
- src/routes/Pivot.test.tsx
- src/routes/Pivot.tsx
- src/shell/ContextBar.test.tsx
- src/shell/ContextBar.tsx
- src/shell/LeftRail.tsx
- src/test/setup.ts
- tsconfig.json
- tsconfig.node.json
- vite.config.ts

## History

- 2026-10-03 `508a02b` — S6: barra's pivot safety rules as client-side guards
  - docs/activepivot-ui-plan.md
  - run/reports/S5-review-1.md
  - run/reports/S6-implementer-1.md
  - run/tracker.md
  - src/ap/guards.test.ts
  - src/ap/guards.ts
  - src/api/types.ts

- 2026-10-03 `9573cdb` — S5: MDX cellset -> PivotResult adapter
  - docs/activepivot-ui-plan.md
  - run/reports/S4b-review-1.md
  - run/reports/S5-implementer-1.md
  - run/tracker.md
  - src/ap/__fixtures__/cellset-rows-cols.json
  - src/ap/__fixtures__/cellset-rows.json
  - src/ap/cellset.test.ts
  - src/ap/cellset.ts

- 2026-10-03 `13944a8` — S4b: MDX builder picks the deepest level by real depth
  - docs/activepivot-ui-plan.md
  - run/reports/S4-review-1.md
  - run/reports/S4b-implementer-1.md
  - run/tracker.md
  - src/ap/discovery.ts
  - src/ap/mdx.test.ts
  - src/ap/mdx.ts

- 2026-10-03 `9e3074a` — S4: pivot query -> MDX text in one pure function
  - docs/activepivot-ui-plan.md
  - run/reports/S3-review-1.md
  - run/reports/S4-implementer-1.md
  - run/tracker.md
  - src/ap/mdx.test.ts
  - src/ap/mdx.ts

- 2026-10-03 `69bd722` — S3: typed cube model from ActivePivot discovery
  - docs/activepivot-ui-plan.md
  - run/reports/S2-review-1.md
  - run/reports/S3-implementer-1.md
  - run/tracker.md
  - src/ap/__fixtures__/discovery.json
  - src/ap/client.ts
  - src/ap/discovery.test.ts
  - src/ap/discovery.ts

- 2026-10-03 `08e453e` — S2: ActivePivot REST client behind a same-origin /ap dev proxy
  - docs/activepivot-ui-plan.md
  - run/reports/S1-review-1.md
  - run/reports/S2-implementer-1.md
  - run/tracker.md
  - src/ap/client.test.ts
  - src/ap/client.ts
  - vite.config.ts

- 2026-10-03 `2cee46d` — S1: seed — trimmed copy of barra_poc's Vite UI (pivot workspace only)
  - .gitignore
  - docs/activepivot-ui-plan.md
  - index.html
  - package-lock.json
  - package.json
  - run/reports/S1-implementer-1.md
  - run/tracker.md
  - src/App.tsx
  - src/api/client.ts
  - src/api/hooks.ts
  - src/api/stream.test.ts
  - src/api/stream.ts
  - src/api/types.ts
  - src/api/views.ts
  - src/components/LineChart.tsx
  - src/components/Markdown.tsx
  - src/components/StreamPanel.tsx
  - src/components/svg.test.tsx
  - src/components/svg.tsx
  - src/components/ui.test.tsx
  - src/components/ui.tsx
  - src/context/AppContext.tsx
  - src/index.css
  - src/lib/format.test.ts
  - src/lib/format.ts
  - src/main.tsx
  - src/pivot/ChartMode.test.tsx
  - src/pivot/ChartMode.tsx
  - src/pivot/FieldList.tsx
  - src/pivot/PivotGrid.test.ts
  - src/pivot/PivotGrid.tsx
  - src/pivot/Repository.tsx
  - src/pivot/usePivot.test.ts
  - src/pivot/usePivot.ts
  - src/pivot/usePivotSort.test.ts
  - src/routes/Pivot.rejection.test.tsx
  - src/routes/Pivot.test.tsx
  - src/routes/Pivot.tsx
  - src/shell/ContextBar.test.tsx
  - src/shell/ContextBar.tsx
  - src/shell/LeftRail.tsx
  - src/test/setup.ts
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts
