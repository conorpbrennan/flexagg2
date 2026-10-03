Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 2.
- tsc -b 0; vitest 12 files / 51 tests. Only ActivePivot fetch is src/ap/client.ts.
- Q1: rewrite ^/ap/ -> / keeps query string; regex key does not capture /api. Deviation sound.
- Q2: AbortError rejects the returned promise; test asserts it.
- Q3: trimMessage never returns ""; empty entries filtered; empty chain -> HTTP <status>.
- Deviations (regex key, minimal RawDiscovery) accepted; every type field is in §2 live facts.
- Red: test imports ./client, absent before the diff.
Advisory: toError swallows an abort during error-body read (benign); no test for empty/missing errorChain (correct by reading).
TDD_GATE: PASS
