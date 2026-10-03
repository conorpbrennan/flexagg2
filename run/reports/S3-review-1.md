Reviewer: code-reviewer, round 1. Verdict: PASS. Critical 0, important 0, advisory 2.
- tsc -b 0; vitest 13 files / 59 tests; fixture parses. Fixture structure diffed against live cube: matches (15 of 175 measures; level types ALL, REGULAR, TIME).
- Amendment: widening RawDiscovery in client.ts is the right home; added fields are exactly those toCubeModel reads.
- Q1: no cell numbers in the fixture (names, captions, types, format strings only).
- Q2: levelKey is the only builder of the bracket form.
- Q3: hidden measures kept; test asserts it.
- FAIL criteria not triggered: only ALL levels and Epoch skipped; escaping round-trips ], [, ., empty.
- Red confirmed from test body (imports absent ./discovery).
Advisory: Epoch skipped by hard-coded name (spec'd); useCubeModel untested (thin wrapper); malformed-key tests assert toThrow() without message.
TDD_GATE: PASS
