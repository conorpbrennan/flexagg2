STEP: S9b (fix round 2)
GATE: `npx tsc -b` 0. `npx vitest run` 0 (19 files, 178 tests). `.venv/bin/python -m pytest -q server/tests` 0 (46 passed; views-store file run 5 more times, 46 each — timer test not flaky). ruff check + format --check pass.
RED FIRST: against the unfixed _tx, 2 failed / 44 passed:
- test_interrupt_right_after_begin_leaves_no_open_transaction: KeyboardInterrupt raised, then `assert not store._conn.in_transaction` -> "assert not True". Timer 0.1 s _thread.interrupt_main, other connection commits at 0.3 s, busy_timeout 3000 (timer approach, not flaky).
- test_failed_rollback_closes_connection_and_keeps_original_chained: `assert fake.closed` -> "assert False" (wrapper whose ROLLBACK raises OperationalError; also checks rollback error's __context__ is the original ValueError and next use raises ProgrammingError).
FILES: server/views_store.py (BEGIN IMMEDIATE first line inside the try; ROLLBACK failure closes the connection and re-raises with the original chained), server/tests/test_views_store.py (two tests; busy-test reader closed in try/finally; _thread, threading imports).
DISAGREEMENTS: none.
DECISIONS: on ROLLBACK failure the rollback error propagates with the original as __context__.
MEASUREMENTS: pytest 46 in ~0.9 s; vitest 178.
BUDGET USED: 1 round.
NEXT: re-review.
