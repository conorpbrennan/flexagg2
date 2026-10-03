# flexagg2++

A pivot explorer for the barra cube. A Vite + React app runs every pivot as MDX against ActivePivot and shows the result in an AG Grid.

Saved views live in a small FastAPI + SQLite service in `server/`, owned by this repo. Dev only: see `docs/serving.md` for what a deploy would need.

## Run it

Three terminals, in this order.

**1. ActivePivot and risk_api** (from barra_poc, unchanged by this repo). One command builds the cube, which listens on :9095, and starts risk_api on :8010. The build takes a minute or two. `/meta` answers only once the cube is ready.

```
cd ~/dev/barra_poc/python_src
BARRA_CUBE_PORT=9095 ../barra/bin/uvicorn risk_api:app --host 127.0.0.1 --port 8010
```

Check: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8010/meta` prints `200`.

**2. Views store** on :8020.

One-off setup:

```
cd ~/dev/flexagg2++
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
```

Run:

```
cd ~/dev/flexagg2++
.venv/bin/uvicorn server.views_api:app --host 127.0.0.1 --port 8020
```

Keep `--host 127.0.0.1`. The store has no auth. The database is `data/views.db` (created on start, git-ignored). Set `VIEWS_DB` to put it elsewhere.

Check: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8020/views` prints `200`.

**3. The app** on :5175.

```
cd ~/dev/flexagg2++
npm ci
npm run dev
```

Open <http://localhost:5175/pivot>. The port is fixed. If :5175 is taken, vite stops instead of moving.

## Environment variables

Set them in the shell, or in `.env.local` (git-ignored).

| Variable | Read by | Default |
|---|---|---|
| `AP_TARGET` | vite proxy `^/ap/` | `http://127.0.0.1:9095` |
| `RISK_API_URL` | vite proxy `/api` | `http://127.0.0.1:8010` |
| `VIEWS_TARGET` | vite proxy `^/views-api/` | `http://127.0.0.1:8020` |
| `VIEWS_DB` | the views store | `data/views.db` |

The browser only ever calls its own origin. Vite strips the prefix and forwards: `/ap/…` to ActivePivot, `/api/…` to risk_api, `/views-api/…` to the store.

## Checks

```
npx tsc -b
npx vitest run
.venv/bin/python -m pytest -q server/tests
npx vite build
```

## How it works

- **The grid is a renderer.** Every number is a cell ActivePivot returned. The browser never sums, averages or fills. Totals are separate MDX queries.
- **Guards run before MDX.** The cube's rules (one ScenarioSet for scenario measures, the manager-independent trio, a default Date) are checked on the query first. A refused query never reaches ActivePivot.
- **risk_api gives two things.** `/meta` feeds the context bar (manager, as-of date, scenario set). `/dims` feeds the guards. Both are read once. Until both have loaded, nothing queries.
- **The context bar needs four levels** in the cube: Manager, Date, ScenarioSet and Units. If one is missing, the page names it and runs nothing.
- **Views are v2.** A saved view holds ActivePivot level keys. A view with any other `schema_version` shows one line ("not loadable") and loads nothing. Levels the cube no longer has are dropped, and one line names them. View file ids carry no `.json`.

## Layout

```
src/ap/        ActivePivot: client, discovery, MDX builder, cellset adapter, guards, bindings, pivotSource
src/api/       risk_api client and hooks; views client (/views-api)
src/pivot/     grid, field list, chart mode, repository (saved views), usePivot
src/routes/    the pivot page
src/shell/     context bar, left rail
src/lib/       number formatting
server/        views store: views_store.py (SQLite), views_api.py (FastAPI), tests/
docs/          the build plan and serving.md
run/, features/  build tracker and step reports
```
