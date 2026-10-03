STEP: S10b (fix round 2; block amended to include server/views_api.py)
GATE:
- `npx tsc -b`: exit 0.
- `npx vitest run`: 5 failed / 183 passed — the known Pivot*.test.tsx failures from S11's unstaged work (not S10b's; src/ untouched). On HEAD+S10b alone (review worktree) the frontend suite is S10's.
- `.venv/bin/python -m pytest -q server/tests`: 91 passed (81 + 10).
- ruff check / format --check: clean.
RED FIRST: test_non_finite_token_in_any_body_field_is_4xx_never_500, parametrized over 10 raw-bytes bodies, 10/10 failed: `AssertionError: (500, 'Internal Server Error') assert 500 < 500`. Bodies: save NaN in name, folder, top-level state, -Infinity top-level state; move NaN in file, Infinity in to_folder; rename NaN in new_name; folder NaN in parent and name; folder/rename NaN in new_name. Each with TestClient(raise_server_exceptions=False), asserts no "nan"/"infinity" in the response, GET /views/item/Public/n 404, Public section still empty.
FILES: server/views_api.py (RequestValidationError handler + import), server/tests/test_views_api.py (lenient fixture + parametrized test). views_store.py and its test untouched.
DISAGREEMENTS: none.
DECISIONS: app-level RequestValidationError handler still returns 422, keeping only loc/msg/type per error (drops input, ctx, url); body parsed normally; state's non-finite 400 unchanged; covers every body route; trade-off: 422 detail no longer echoes the offending input.
MEASUREMENTS: pytest 91 in ~2.4 s; vitest 183 pass / 5 fail.
BUDGET USED: 1 round.
NEXT: re-review.
