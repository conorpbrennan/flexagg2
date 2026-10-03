# Serving (not applied)

Nothing here is installed. `/etc` is untouched. This is what a deploy would need.

## Where it lives

The build is made for `/` (`base: "/"`). It cannot sit under a path on barra's site. Give it its own host or its own port.

## Three proxied prefixes

Serve `dist/` (from `npx vite build`) as static files. Proxy these, with the prefix stripped:

| Prefix | Target |
|---|---|
| `/ap/` | ActivePivot, `127.0.0.1:9095` |
| `/api/` | risk_api, `127.0.0.1:8010` |
| `/views-api/` | views store, `127.0.0.1:8020` |

Put all three behind basic auth. Do not buffer `/api/` responses: the LLM endpoints stream. Send unknown paths to `index.html`, since the app routes in the browser.

## ActivePivot must not be exposed

:9095 listens on all interfaces. It answers anonymously with ROLE_ADMIN. It accepted a content write and delete when probed. Anyone who can reach the port can change the cube.

Reach it only through the `/ap/` proxy. Close :9095 to everything else. That is a barra_poc setting, so it is outside this repo.

The views store has no auth either. Keep it on `127.0.0.1`.
