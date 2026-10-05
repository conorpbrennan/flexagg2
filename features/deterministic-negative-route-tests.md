# Deterministic Negative Route Tests

**Requirement**: Replace the 30 ms sleeps in the Pivot route's "no query" tests with deterministic checks.

**Started**: 2026-10-05
**Last updated**: 2026-10-05
**Branch**: deterministic-negative-route-tests

## Files involved

- src/routes/Pivot.test.tsx

## History

- 2026-10-05 `02d9066` — test(Pivot): count no-query changes synchronously instead of sleeping 30 ms
  - src/routes/Pivot.test.tsx
