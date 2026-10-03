Reviewer: code-reviewer-deep, round 1. Verdict: PASS. Critical 0, important 1, advisory 4.
- Gate: pytest 41 passed; tsc -b 0; vitest 19 / 178.
- Q1: no input writes outside its section/folder. Rejected: .., ../x, a/../b, ., /a, a/, a//b, \, NUL, \n, U+00A0, U+2028, U+0085. Unicode look-alikes (U+2215, U+FF0F, U+2024, U+200B, BOM-prefixed ..) stay plain data in one segment. Lone surrogate raises inside the tx and rolls back.
- Q2: multi-row changes are one transaction on disk; planted-clash test proves it. Mutation: splitting rename_folder into two tx fails a test; checking only the last segment fails 5 tests.
- Q3: all SQL parameterised; no LIKE; prefix matching via substr holds against % and _ and non-BMP/combining chars.
- Slugify parity with barra's views_repo.slugify: 19 inputs, 0 mismatches.
- Red confirmed (module import).
IMPORTANT 1: server/views_store.py _tx runs COMMIT outside the try; if COMMIT fails (SQLITE_BUSY with a second connection holding a read lock) nothing rolls back — the connection stays in a transaction, its own reads show the uncommitted rename, later writes fail "cannot start a transaction within a transaction", and the lock blocks fresh stores until restart. Fix: COMMIT inside try, ROLLBACK on any failure; optional WAL; test with a reader on a second connection.
ADVISORY: no close()/context manager (S10 needs a lifetime); segments may be " ..", ".. ", U+200B, no length cap; load/delete/move/rename take an unchecked slug (equality lookup only; S10 must route file ids through parse_file); slugify test hard-codes values.
-> Orchestrator: IMPORTANT 1 becomes inserted step S9b (§18.6).
TDD_GATE: PASS
