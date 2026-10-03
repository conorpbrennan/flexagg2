STEP: S9b
GATE:
- `npx tsc -b` -> exit 0
- `npx vitest run` -> 19 files, 178 tests, exit 0
- `.venv/bin/python -m pytest -q server/tests` -> 44 passed (S9 had 41)
- `.venv/bin/ruff check server && .venv/bin/ruff format --check server` -> pass (one PYI034 and one format fix along the way)
RED FIRST: test_failed_commit_leaves_no_open_transaction (second connection holds BEGIN + SELECT; store with PRAGMA busy_timeout=50 attempts save; asserts OperationalError, then not in_transaction, tree shows only "keep", after reader.close() a save succeeds), test_context_manager_closes_connection, test_close_is_idempotent. Before implementation: 3 failed, 41 passed — `assert not True ... in_transaction` (wedge reproduced on S9's _tx); `TypeError: 'ViewsStore' object does not support the context manager protocol`; `AttributeError: 'ViewsStore' object has no attribute 'close'`. The first test fails on S9's real _tx (mutation requirement met).
FILES: server/views_store.py, server/tests/test_views_store.py, plan §9. Matches declared set.
DISAGREEMENTS: none. ("short busy timeout": ViewsStore has no timeout parameter; see decisions.)
DECISIONS THE PLAN LEFT OPEN (in §9):
- Busy timeout set in the test via `store._conn.execute("PRAGMA busy_timeout=50")`, no constructor argument.
- WAL not enabled (changes on-disk mode; reviewer said optional).
- close() idempotent, takes the RLock; use after close raises sqlite3.ProgrammingError; __enter__ returns Self.
- _tx: COMMIT inside try; except BaseException -> ROLLBACK if in_transaction, re-raise.
MEASUREMENTS: pytest 41 -> 44; vitest 178 / 19.
BUDGET USED: well inside 10 min, 1 round.
NEXT: S10 opens one ViewsStore at startup and closes it on shutdown. Default busy timeout 5 s; a contended write raises sqlite3.OperationalError ("database is locked") — S10 should map it to 503/409, not a 500. Unaddressed reviewer advisories: segment length cap, odd segments like " ..". S10 routes file ids through parse_file.
