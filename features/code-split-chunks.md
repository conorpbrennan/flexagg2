# Code Split Chunks

**Requirement**: Split the vendor libraries out of the Pivot and ChartMode chunks so vite build has no chunk-size warning, accepting ag-grid's single ~900 kB module with a warning limit just above it.

**Started**: 2026-10-05
**Last updated**: 2026-10-05
**Branch**: code-split-chunks

## Files involved

- src/test/viteConfig.test.ts
- tsconfig.node.json
- vite.config.ts

## History

- 2026-10-05 `be70360` — build: split vendor chunks so vite build has no chunk-size warning
  - src/test/viteConfig.test.ts
  - tsconfig.node.json
  - vite.config.ts
