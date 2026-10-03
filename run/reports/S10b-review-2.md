Reviewer: code-reviewer, round 2 (whole staged diff). Verdict: PASS. Critical 0, important 0, advisory 3.
- pytest 91 in worktree.
- Q1: save is the only state_json writer (views_store.py:262-266); allow_nan=False before _tx; resave test covers overwrite.
- Q2: no 500 found: state NaN/1e999/-1e999/1e400 -> 400 (422 if not an object), nothing stored; NaN/Infinity/-Infinity/1e999 in name/folder/file/to_folder -> 422 loc/msg/type only; truncated JSON, bare NaN body, [NaN] body -> 422; NaN path segment or ?x=NaN on GET -> 404/200; 1e308 saves and loads.
- Q3: CRITICAL 1 and IMPORTANT closed. Ordinary 422s keep status and detail[{loc,msg,type}]; only input/ctx dropped.
- Red confirmed by mutation (handler disabled: 10 fail, 7 pass for -k non_finite).
Advisory: no test pins 1e999 in state; handler is app-wide (intended, commented); plan block not wrong.
TDD_GATE: PASS
