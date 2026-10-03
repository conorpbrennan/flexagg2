Reviewer: code-reviewer-deep, round 1. Verdict: PASS. Critical 0, important 4, advisory 6.
- tsc -b 0; vitest 14 files / 82 tests. Escaping probed with ], ]]], a]]b, [, ., ', newline, "", and an injection string as member/measure/cube: none closes a bracket early; live server reads ]] as a literal ]. Malformed level keys throw in parseLevelKey.
- Round-3 fold-ins: memberKey slicing short form matches plan and is accepted live (200); test (l) exact.
- Q1 escaping holds. Q2 axis ids: COLUMNS 0, ROWS 1; rows namePath starts with AllMember. Q3 two filters on one hierarchy: explicit Error, tested.
IMPORTANT:
1. "Last in caller order = deepest" is unsafe: rows [Sector, Country] puts Country on the axis, Sector silently dropped (live 200, namePath length 2). ApQuery carries no depth; LevelInfo.depth exists.
2. Exported memberKey splices lvlKey without normalising; slicing.includes compares unnormalised spellings.
3. Test (h) and throw tests at mdx.test.ts:130-132 assert the message as substring.
4. Untested: reversed level order; multi-part slicing throw; members with [, ', newline; same hierarchy on rows and cols.
ADVISORY: same hierarchy on both axes not caught (server 400s); empty path -> `.[]` (server 400s); member name containing U+241E splits; esc duplicated in discovery.ts and mdx.ts; second drill (Country->Sector->Issuer) would add a second filter on one hierarchy and throw — S7 should replace the parent filter; declared decisions otherwise acceptable.
-> Orchestrator: findings outside the closed FAIL list become inserted step S4b (§18.6).
TDD_GATE: PASS
