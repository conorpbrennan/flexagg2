Reviewer: code-reviewer-deep, round 1. Verdict: PASS. Critical 0, important 0, advisory 3.
- Gate re-run: tsc -b 0; vitest 14 files / 91 tests; grep -cF esc 0 (mdx.ts) / 1 (discovery.ts).
- Red confirmed by running new mdx.test.ts against HEAD's mdx.ts: exactly the claimed 6 fail.
- Q1: no order lets a shallower level win with real depths (replace only when d > cur.depth); equal depth keeps first; duplicates fine; same level on both axes throws.
- Q2: every throw asserted with an anchored regex.
- Q3: no S4 expected MDX string changed.
- Live: Manager on cols 400 (known retrieval limit); same shape without Manager 200.
ADVISORY: 1) non-number depth (NaN/null/string) can let the shallower level win — not reachable from toCubeModel/TS types; a Number.isFinite check would fail closed. 2) S4b block's "unnormalised key writes normalised form" test is unmeetable (no such input); implementer's test and §9 line say so correctly. 3) unused "[D]]].[H].[L]" depth entry in test map.
TDD_GATE: PASS
