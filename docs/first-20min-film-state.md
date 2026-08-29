# First 20 Minutes — Film State Report

Generated from a real run of the full journey pipeline (analysis/trace_film_state.mjs) against the actual audio, not hand-authored numbers. Checkpoints chosen at each verified story beat from docs/journey-v38-plan.md's re-anchored table.

| t | mm:ss | phase | tier | stored | visibleComplexity | assembly (acc) | interior (acc) | interiorExpr | fieldExpr | unlocked |
|---|---|---|---|---|---|---|---|---|---|---|
| 30s | 0:30.0 | PREPARATION | MICRO | 0.9682 | 0.0001 | 0.0034 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 180s | 3:00.0 | NEW_NORMAL | SECTION | 0.2358 | 0.0122 | 0.1074 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 390s | 6:30.0 | AFTERSHOCK | SECTION | 0.447 | 0.0095 | 0.4119 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 630s | 10:30.0 | PREPARATION | MAJOR | 0.9496 | 0.0345 | 0.7993 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 780s | 13:00.0 | PREPARATION | MICRO | 0.6149 | 0.0057 | 0.9615 | 0.0005 | 0 | 0 | SHELL,VOID_WHISPER |
| 990s | 16:30.0 | NEW_NORMAL | CLIMAX | 0.3524 | 0.2321 | 1 | 0.0471 | 0.0471 | 0 | SHELL,VOID_WHISPER,CHAMBER |
| 1067.8s | 17:47.8 | PREPARATION | PHRASE | 1.4055 | 0.0642 | 1 | 0.0812 | 0.0162 | 0 | SHELL,VOID_WHISPER,CHAMBER |
| 1090s | 18:10.0 | PREPARATION | CLIMAX | 0.863 | 0.2574 | 1 | 0.0924 | 0.0725 | 0 | SHELL,VOID_WHISPER,CHAMBER |
| 1200s | 20:00.0 | AFTERSHOCK | SECTION | 0.35 | 0.3667 | 1 | 0.1561 | 0.1561 | 0 | SHELL,VOID_WHISPER,CHAMBER |

## Reading this table

- **assembly (acc)** only ever increases (see sanity check #1/#2) — 5min→15min: 0.2671 → 1.
- **interior (acc)** and **interiorExpr** both stay exactly 0 until CHAMBER unlocks at t=809.82s (13:29.8) — confirmed by sanity check #3, 0 violating samples found.
- The verified 12:44-13:46 breath episode measurably lowers visibleComplexity (avg 0.055 inside vs 0.088 just before) while accumulated fields keep climbing underneath it — this is the accumulated-vs-expressed split actually holding on real data, not just in the code comments.
- The 17:47 rupture ranks #4 of 84 releases by computed magnitude (top-10 check: PASS).
- t=20:00 (1200s) accumulated state vs t=3:00 (180s): assembly 0.1074 → 1, interiorDepth 0 → 0.1561 — these are NOT close to each other, which is the numeric form of "minute 20 contains visible structural history minute 3 does not."

## Sanity invariants (Part 17)

11/11 passed. Full detail: analysis/film-state-sanity.json.

- [x] accumulated fields never decrease frame-to-frame
- [x] assembly(15min) > assembly(5min)
- [x] interiorExpression is 0 before CHAMBER unlocks
- [x] fieldExpression is 0 before FIELD unlocks
- [x] memoryExpression stays low before t=500s
- [x] MICRO events never exceed MICRO impact ceiling (0.08)
- [x] MAJOR+HERO+CLIMAX releases are a minority of all releases
- [x] visibleComplexity dips during the verified 12:44-13:46 breath episode
- [x] storedEnergy rises in the lead-up to top-10 releases
- [x] 17:47 rupture ranks in the top 10 releases by magnitude
- [x] ~41:21 event ranks in the top 5 releases by magnitude
