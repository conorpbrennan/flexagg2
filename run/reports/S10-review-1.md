Reviewer: code-reviewer-deep, round 1. Verdict: PASS. Critical 0, important 1, advisory 2.
- Gate: pytest 74; tsc -b 0; vitest 178.
- Probes (TestClient and raw uvicorn on 127.0.0.1:8029, curl --path-as-is): Public/../Private/p, %2e%2e, %2F..%2F, ..%5C -> 400; folder DELETE Public/.. and %2f..%2f -> 400; Public, Public.json, Public/.json, Public//a, empty, %00, Foo/a -> 400; a.json.json -> 404; bad folder values -> 400; cross-section move 400; missing folder 404; section-root rename/delete 400; non-string body 422. Nothing reaches outside its section; validation delegated to the store.
- Q1: all 9 routes match barra's method, path, body fields, response keys; every difference has a §9 entry (no .json, 404 on missing folder, refuse overwrite, "" folder 400, slash handling 400, cross-section 400, make_folder rejects, 503 on lock). views.ts needs only base URL.
- Q2: no bind code; run command --host 127.0.0.1; uvicorn default also loopback.
- Red holds (module-level import).
IMPORTANT 1: a save with NaN/Infinity in state (hand-built body) is stored (200) and every later load 500s (FastAPI JSON refuses NaN). Fix in the store: json.dumps(state, allow_nan=False) -> ValueError -> 400; API test.
ADVISORY: move with to_folder "" gives a misleading "between sections" message; every OperationalError -> 503 with its message (comment the intended lock case).
-> Orchestrator: IMPORTANT 1 becomes inserted step S10b (§18.6).
TDD_GATE: PASS
