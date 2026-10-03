STEP: S10b
GATE:
- `npx tsc -b`: exit 0.
- `npx vitest run`: 19 files, 178 tests.
- `.venv/bin/python -m pytest -q server/tests`: 81 passed (was 74).
- ruff check / format --check: clean (UP031 fixed on the way).
RED FIRST: store + API tests against S10: 7 failed, 74 passed. API: `AssertionError: {"file":"Public/n"} assert 200 == 400` for NaN, Infinity, -Infinity. Store: save raised nothing for nan/inf/-inf, and a resave stored NaN over the old state. Assertions: store pytest.raises(ValueError) on nan/inf/-inf (top level and nested), tree unchanged, resave keeps old state; API raw bytes `{"name":"n","folder":"Public","state":{"v":NaN}}` -> 400 and GET /views/item/Public/n -> 404.
FILES: server/views_store.py, server/tests/test_views_store.py, server/tests/test_views_api.py, plan §9. Matches declared set. views_api.py and src/ untouched.
DISAGREEMENTS: none. "wherever it writes state_json": only `save` writes it; move/rename/folder ops never touch it.
DECISIONS (in §9): json.dumps(state, allow_nan=False) computed before the transaction opens (rejected save writes nothing, creates no folder); refusal in the store, not the route (pydantic dict accepts the raw NaN token).
MEASUREMENTS: pytest 81; vitest 178; 7 new parametrized cases (store 3+1, API 3).
BUDGET USED: within 10 min, 1 round.
NEXT: views stored with NaN before this fix would still 500 on load (none expected in a fresh db). S10 advisories (to_folder "" message; comment the OperationalError->503 case) remain open.
