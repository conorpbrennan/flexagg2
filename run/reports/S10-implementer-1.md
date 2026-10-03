STEP: S10
GATE:
- `npx tsc -b` -> exit 0
- `npx vitest run` -> 19 files, 178 tests
- `.venv/bin/python -m pytest -q server/tests` -> 74 passed, 1 warning (starlette: httpx deprecated for TestClient)
- ruff check / format --check -> clean (6 files)
- Smoke: uvicorn 127.0.0.1:8020 with VIEWS_DB in scratchpad, GET /views -> 200; stopped.
RED FIRST: `pytest -q server/tests/test_views_api.py` -> collection error `ModuleNotFoundError: No module named 'server.views_api'` (test written first). All 27 passed on first run after implementing.
FILES: server/views_api.py, server/tests/test_views_api.py (declared); plan §9. No src/ change.
DISAGREEMENTS:
- barra's views_api.py has no 404 for folder rename/delete (catches ValueError only) and its move/rename overwrite silently; used the store's behaviour (see decisions).
- "DB created on start": directory created in the app lifespan, not at import.
DECISIONS THE PLAN LEFT OPEN (in §9):
- App factory `create_app(db_path=None)` + module-level `app = create_app()`; DB path = argument, else env VIEWS_DB, else <repo>/data/views.db; store opened in lifespan, closed on shutdown.
- `.json` suffix on an incoming file id accepted and stripped; responses never carry it; DELETE echoes the id as sent (as barra).
- Folder values (folder, parent, to_folder, rel) carry the section prefix as in barra; empty string, trailing or doubled slash -> 400; cross-section move -> 400.
- Status: FileNotFoundError 404, ValueError 400, sqlite OperationalError (lock timeout) 503 via exception handler; missing folder on rename/delete 404; rename/delete of a section root 400; move/rename onto an existing view 400 (S9 refuses to overwrite).
- Sync def handlers (threadpool); store RLock serialises.
- GET /views with empty `section=` returns both sections (as barra).
MEASUREMENTS: 27 new tests (74 total, 47 before); vitest 178/19; smoke 200.
BUDGET USED: well within 20 min, 1 round.
NEXT:
- S11: views.ts needs only a base-URL change apart from routes it does not use yet (/views/move, /views/rename, /views/folder/rename, DELETE /views/folder/{rel}).
- File ids `Public/Risk/slug`, no `.json`; ViewDoc carries schema_version 2 and path `Public/Risk`.
- The /views-api proxy must strip the prefix (server serves /views/...).
- save -> {file}; delete -> {deleted}. Folder rename/delete take a section-prefixed rel.
- Loopback is the run command's --host 127.0.0.1; no bind code in the module.
- Reviewer: look at _split_folder and _split_file (segment validation delegated to the store).
