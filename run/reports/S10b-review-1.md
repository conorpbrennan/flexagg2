Reviewer: code-reviewer, round 1. Verdict: FAIL. Critical 1, important 1.
- pytest 81 in worktree. Store fix correct: save is the only state_json writer; allow_nan=False before the tx; NaN/Infinity/-Infinity/nested/1e999 inside a valid state dict -> 400, nothing stored. NaN/Infinity as strings in name/folder are ordinary text (200).
CRITICAL 1: server/views_api.py SaveBody/put_view — a bare NaN token in a field that fails pydantic validation returns 500: {"name":NaN,...}, {"folder":NaN,...}, {"state":NaN}. Cause: pydantic's 422 detail echoes the NaN input and JSONResponse cannot render it ("Out of range float values are not JSON compliant: nan"). Nothing stored, but 500 — meets the step's FAIL criterion. Fix at body parse / RequestValidationError handler; test each field.
IMPORTANT 1: the S10b plan block scoped the problem to `state` and put views_api.py off-limits; amend.
Red credible from the test bodies (7 = 3 API + 3 store + 1 resave).
-> Orchestrator: S10b block amended (views_api.py added, any-field 4xx); fix round 2 dispatched.
TDD_GATE: FAIL
