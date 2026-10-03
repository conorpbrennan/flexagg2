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
- run/tracker.md
- src/App.tsx
- src/ap/__fixtures__/discovery.json
- src/ap/client.test.ts
- src/ap/client.ts
- src/ap/discovery.test.ts
- src/ap/discovery.ts
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
