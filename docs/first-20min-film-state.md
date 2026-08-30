# First 20 Minutes — Film State Report

Generated from a real run of the full journey pipeline (analysis/trace_film_state.mjs) against the actual audio, not hand-authored numbers. Checkpoints chosen at each verified story beat from docs/journey-v38-plan.md's re-anchored table.

| t | mm:ss | phase | tier | rawEnergy | effEnergy | visibleComplexity | assembly (acc) | interiorHint (acc) | interior (acc) | interiorExpr | fieldExpr | unlocked |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 30s | 0:30.0 | PREPARATION | MICRO | 0.9682 | 0.2429 | 0.0001 | 0.0034 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 180s | 3:00.0 | NEW_NORMAL | PHRASE | 0.2358 | 0.0711 | 0.0122 | 0.1074 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 390s | 6:30.0 | AFTERSHOCK | PHRASE | 0.447 | 0.1851 | 0.0095 | 0.4119 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 630s | 10:30.0 | PREPARATION | SECTION | 0.9496 | 0.5392 | 0.0345 | 0.7993 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 780s | 13:00.0 | PREPARATION | MICRO | 0.6149 | 0.4066 | 0.0057 | 0.9615 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 990s | 16:30.0 | NEW_NORMAL | MAJOR | 0.3524 | 0.263 | 0.2164 | 1 | 0 | 0 | 0 | 0 | SHELL,VOID_WHISPER |
| 1067.8s | 17:47.8 | PREPARATION | PHRASE | 1.4055 | 1.089 | 0.0588 | 1 | 0.35 | 0 | 0 | 0 | SHELL,VOID_WHISPER,INTERIOR_HINT |
| 1090s | 18:10.0 | PREPARATION | HERO | 0.863 | 0.6775 | 0.2472 | 1 | 0.35 | 0.0007 | 0.0006 | 0 | SHELL,VOID_WHISPER,INTERIOR_HINT,INTERIOR_REVEALED |
| 1200s | 20:00.0 | AFTERSHOCK | PHRASE | 0.35 | 0.2911 | 0.3224 | 1 | 0.35 | 0.0231 | 0.0231 | 0 | SHELL,VOID_WHISPER,INTERIOR_HINT,INTERIOR_REVEALED |

## Reading this table

- **assembly (acc)** only ever increases (see sanity check #1/#2) — 5min→15min: 0.2671 → 1.
- **interior (acc)** and **interiorExpr** both stay exactly 0 until INTERIOR_REVEALED unlocks at t=1067.82s (17:47.8, the verified rupture) — confirmed by sanity check, 0 violating samples found. **interiorHint (acc)** is allowed to rise from t=1034.38s (17:14.4) but stays bounded below 0.35 — the pre-reveal "concavity/seam/aperture-suggestion" reading, never a claim of true interior.
- The verified 12:44-13:46 breath episode measurably lowers visibleComplexity (avg 0.057 inside vs 0.092 just before) while accumulated fields keep climbing underneath it (0 monotonicity violations in that window) — expression is suppressed, development is not.
- The 17:47 rupture ranks #4 of 84 releases by computed magnitude (top-10 check: PASS) and its globalStoryTier is **HERO** (HERO check: PASS) — HERO, not CLIMAX, per Part 3.
- **rawEnergy vs effEnergy**: at t=0 the organism's visual capacity floors effEnergy well below what the raw musical measurement alone would allow (capacity check: PASS, opening ratio 0.250 vs mature 0.996) — "the möykky learns how to hold energy."
- t=20:00 (1200s) accumulated state vs t=3:00 (180s): assembly 0.1074 → 1, interiorDepth 0 → 0.0231 — these are NOT close to each other, which is the numeric form of "minute 20 contains visible structural history minute 3 does not."

## Sanity invariants (Part 17)

17/17 passed. Full detail: analysis/film-state-sanity.json.

- [x] accumulated fields never decrease frame-to-frame
- [x] assembly(15min) > assembly(5min)
- [x] interiorExpression is exactly 0 before the 17:47 INTERIOR_REVEALED unlock
- [x] interiorHintExpression is 0 before INTERIOR_HINT unlocks and stays bounded (<0.4)
- [x] fieldExpression is 0 before FIELD unlocks
- [x] memoryExpression stays low before t=500s
- [x] MICRO events never exceed MICRO impact ceiling (0.08)
- [x] MAJOR+HERO+CLIMAX releases are a minority of all releases
- [x] visibleComplexity dips during the verified 12:44-13:46 breath episode
- [x] storedEnergy rises in the lead-up to top-10 releases
- [x] 17:47 rupture ranks in the top 10 releases by magnitude
- [x] ~41:21 event ranks in the top 5 releases by magnitude
- [x] 17:47 rupture's tier is HERO, not CLIMAX
- [x] no CLIMAX release before the final-convergence window
- [x] exactly one CLIMAX release in the whole film
- [x] opening visual-energy capacity is much lower than mature capacity
- [x] quiet 12:44-13:46 breath suppresses expression without reversing development
