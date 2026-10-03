STEP: S9
GATE:
- `.venv/bin/python -m pytest -q server/tests`: 41 passed, exit 0.
- `npx tsc -b`: exit 0.
- `npx vitest run`: 19 files, 178 tests, exit 0.
- `git check-ignore .venv data`: `.venv`; `data` not yet created (rule present in .gitignore).
- Extra: `.venv/bin/ruff check server` and `ruff format --check server` pass (UP035, TRY004 fixed). ruff in venv only, not in requirements.
RED FIRST: test_views_store.py written first; pytest failed: `from server.views_store import SCHEMA_VERSION, ViewsStore, parse_file, slugify` -> `ModuleNotFoundError: No module named 'server.views_store'`, `1 error in 0.07s`. First green run had 2 failures: a wrong rollback-test assertion, and a real bug (`parse_file` let `Public//v` collapse to a valid id) fixed per segment.
FILES: NEW server/__init__.py, server/views_store.py, server/tests/__init__.py, server/tests/test_views_store.py, server/requirements.txt, pytest.ini. EXTEND .gitignore (`.venv/`, `data/`). Plan §9 (always permitted). Matches declared set. No src/ change, no index-changing git command.
DISAGREEMENTS:
- Step says `file` = `<section>/<folder>/<slug>`; barra's ended in `.json`. Followed the step (no `.json`); S10 and the frontend must not append it.
- Barra's folder_name sanitises separators to a space; step says reject. Rejected.
- Barra's move_view/rename_view overwrite silently; these raise ValueError on a clash.
DECISIONS THE PLAN LEFT OPEN (in §9):
- `file` has no `.json`; leaf and doc `path` is `<section>/<folder>` as in barra.
- Folder args are section-relative, "" = section root; added `parse_file(file) -> (section, folder, slug)`, checking every segment.
- Errors: FileNotFoundError for missing view/folder (S10 -> 404); ValueError for bad section, path, clash, non-empty folder (S10 -> 400).
- move_view/rename_view refuse to overwrite; rename_folder refuses an existing target.
- `save` into a missing folder creates it and ancestors (as barra); make_folder idempotent.
- Segments reject blank, `.`, `..`, `/`, `\`, control characters, on every segment. Unicode look-alikes are plain data (folders are rows, not filesystem paths); a test shows they stay in their segment.
- delete_view idempotent (as barra).
- schema_version is the constant 2 emitted on load, not a stored column.
- One connection behind an RLock, `BEGIN IMMEDIATE` per write; every multi-row change in one transaction; a test plants a UNIQUE clash mid-rename and asserts nothing half-applied.
- Pinned: fastapi==0.142.2, uvicorn==0.54.0, pytest==9.1.1, httpx==0.28.1.
- pytest.ini: testpaths = server/tests, pythonpath = .
MEASUREMENTS: 41 pytest tests 0.50 s; vitest 19 files / 178; Python 3.12.3.
BUDGET USED: one implementation round, well inside 30 min.
NEXT:
- ViewsStore methods for S10 (call parse_file on each `file`): tree(section); load(section, folder, slug); save(section, folder, name, state) -> file; delete_view(section, folder, slug); move_view(section, folder, slug, to_folder) -> file; rename_view(section, folder, slug, new_name) -> file; make_folder(section, parent, name) -> path; rename_folder(section, path, new_name) -> path; delete_folder(section, path).
- Barra's folder paths and to_folder included the section prefix (`Public/Risk`); the store's do not — S10 splits the section off.
- barra GET /views returned `{sections: {Public: tree, Private: tree}}` or `{section, tree}` for one section.
- ViewsStore(db_path) creates the parent directory; S10 chooses the default DB location under data/.
