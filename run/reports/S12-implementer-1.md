STEP: S12
GATE (mechanical half; owner read pending):
- npm ci (scratch copy of package.json + lock): exit 0.
- python3 -m venv .venv + pip install -r server/requirements.txt (scratch venv): exit 0.
- Views store as written (VIEWS_DB in scratchpad): GET :8020/views 200; scratch db created; stopped.
- `npm run dev`: GET localhost:5175/pivot 200; via proxy /views-api/views 200, /api/meta 200, /ap/activeviam/pivot/rest/v9/cube/discovery 200; stopped.
- risk_api check: curl 127.0.0.1:8010/meta 200 (running process).
- After stop: nothing on 8020/5175.
- Checks section: tsc -b 0; vitest 0 (21 / 188); pytest 0 (91); vite build 0.
- Not run, verified by reading: barra_poc start command (matches run_all_tailscale.sh lines 41-42 and the running process's cmdline); default DB path data/views.db (server/views_api.py:184; data/ ignored).
- Paths/env vars grepped: AP_TARGET, RISK_API_URL, VIEWS_TARGET in vite.config.ts; VIEWS_DB in server/views_api.py; Layout directories exist; .env.local covered by *.local and loadEnv.
RED FIRST: n/a (docs)
FILES: README.md (NEW), docs/serving.md (NEW).
DISAGREEMENTS:
- Plan says three processes (ActivePivot, risk_api, views store); in barra_poc one uvicorn command builds the cube (:9095) and starts risk_api (:8010). README: three terminals — barra_poc, store, vite. (run_all_tailscale.sh:41, risk_api.py:83)
- README also lists RISK_API_URL (§9 S1). Cube port env BARRA_CUBE_PORT=9095 is barra_poc's; its default 9091 would break the /ap default.
DECISIONS: venv setup lines added; env via shell or .env.local; Checks section; serving.md adds static dist/ with SPA fallback, unbuffered /api, store has no auth; README states missing-binding behaviour, v2 refusal, dropped levels, no .json ids, guards wait for /dims and /meta.
MEASUREMENTS: vitest 21 / 188; pytest 91; curl codes above.
BUDGET USED: ~10 min, 1 round.
NEXT (owner): cube build "a minute or two" is from barra's script text, not timed. barra_poc's docs/vite-ui-serving.md uses BARRA_CUBE_PORT=9091; started that way, the /ap proxy needs AP_TARGET=http://127.0.0.1:9091.
