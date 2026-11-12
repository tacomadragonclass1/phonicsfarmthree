# Progress

Living ledger. Result vocabulary (see `TESTING.md` §4): *unit-tested*,
*seen in browser*, *driven in browser*, *confirmed on device*, *untested*.

## State — 2026-11-11

- Standalone repository `phonicsfarmthree`, local only: `git init` done,
  **no remote** (kept local by decision). Each task is committed as it
  passes review.
- Stage A complete. Stage B (vertical slice) in progress.
- The vertical slice runs: `npm run build && npx vite preview --port 4317`.

## Task ledger

| ID | Task | Model | State | Review notes |
|---|---|---|---|---|
| EVAL-001 | Fixed-step loop + Bobber + tests (model comparison) | Strata, 27B | accepted — Strata's files kept | Both passed 8/8 hidden acceptance tests. |
| B-01 | `Emitter`, `math` | Strata | accepted — unit-tested | 547 s. Clean typing for void events; 30 tests. |
| B-02 | Asset manifest | Strata | accepted — unit-tested | |
| B-05 | `PhonemeSequencer`, `AudioEngine` | Strata | accepted — unit-tested | |
| B-08 | Follow camera rig | Strata | accepted — unit-tested | |
| B-03 | `AssetLibrary` | Strata | accepted — unit-tested | |
| B-06 | Carry rules | Strata | accepted — unit-tested | Passed hidden acceptance tests. |
| B-07 | Physics world + character | Strata ×3 | accepted — unit-tested | Three sessions. Two defects found in review by probing Rapier directly: a 1 m/s "stick to ground" speed stalled the walk on scattered steps (now 0; snap-to-ground does the job), and the ramp test walked off the top of its own ramp. Both corrected by the architect (one constant, one test). |
| B-04 | Input | Strata | accepted — unit-tested | |
| B-10 | Letter faces | Strata | accepted — unit-tested | Glyph shapes not yet seen in a browser. |
| B-09 | Painted material, ink outline, lighting | Strata | accepted — unit-tested | Shaders checked structurally only; untested on a GPU. |
| B-11d | Collider builder | Strata | accepted — unit-tested | |
| B-11a | Block / pedestal / character views | Strata ×3 | accepted — unit-tested, seen in browser | Two timeouts; tests rewritten small as B-11a3. |
| B-11b | Page shell, HUD | Strata | accepted — unit-tested, seen in browser | |
| B-11c | World builder | Strata | accepted — unit-tested, driven in browser | |
| B-11e | `main.ts` composition root | Strata | accepted — driven in browser | |
| B-12 | Browser run-through | architect | first pass done | See below. |

## B-12 first browser pass (production build, desktop Brave, via `window.__pf`)

Driven: start, walk, stop against a block, block lights up, pick up, carry,
stump lights up, place on stump (block at y 0.61), take back, drop on grass.
All correct.

Four defects no Node test could see, fixed in review by the architect
(each one to six lines):
1. Audio loader built URLs against the relative base `./` and threw.
2. Start-up awaited the audio unlock, which never resolves without a
   trusted gesture; the game now starts regardless and retries on input.
3. `FixedStepLoop` stored `requestAnimationFrame` bare and called it as a
   method ("Illegal invocation"): the loop never ran in a browser.
4. Physics query groups had membership and filter swapped, so every reach
   ray cast from inside Chuck hit Chuck. Regression test added.

**Not yet verified:** sound (needs a real key press or tap), frame rate (the
automated browser window was throttled to about 1 frame a second, so nothing
about performance can be concluded), keyboard / touch / gamepad on real
devices, the ink outline weight and the focus highlight (both look faint).

## Stage C — "Build it" (first pass, 2026-11-11)

| ID | Task | Model | State |
|---|---|---|---|
| C-01 | Scene turned to read left to right, eight blocks, carry position, stronger lit state | Strata, 3 min | accepted — seen in browser |
| C-02 | `WordRules`, word list | Strata, 11 min | accepted — unit-tested |
| C-03 | `BellView`, block pulse / celebrate | Strata, 5 min | accepted — unit-tested |
| C-04 | Bell in the world, synthesised chime, wiring | Strata, 6 min | accepted — driven in browser |

Driven in the browser with audio running: s, a, t carried to the three
stumps, bell lit and rung, sounding ran to its end. Not yet confirmed by
ear or eye: the sounds themselves, the block hops, the chime.

Small exact briefs with a size cap on tests and `timeout` in front of every
test run took Strata 3-11 minutes each, against repeated 30-minute timeouts
for the larger briefs of stage B.

## Stage D — village and "Find it" (first pass, 2026-11-11)

| ID | Task | Model | State |
|---|---|---|---|
| W-01 | Village built from `src/world/layout.ts`: 3 x 3 mirrored terrain, 46 props, world edge | Strata, 7 min | accepted — seen in browser |
| F-01 | `FindRules` | Strata, 5 min | accepted — unit-tested |
| F-02 | Annette in the world, Find it wired | Strata, 3 min | accepted — driven in browser |

Driven in the browser: Annette lit, asked for a sound, a wrong block left
the request standing, the right block cleared it.

Found in the browser and fixed in the layout data: the terrain mesh is not
centred on its origin, so tiles at a round 26 m left a 0.16 m gap on two
sides. Tiles now sit at twice the shared edge coordinate.

Open: on a hilltop with rising ground behind Chuck the camera collision
pulls right in to its 3.5 m minimum (seen at x -14, z -10). Props were
placed from measurements, not by eye. Mirrored lanes repeat across tiles.

## Stage E — Phoneme Village and CVC Land (first pass, 2026-11-11)

| ID | Task | Model | State |
|---|---|---|---|
| V-01 | Picket fence generated in code (no fence model exists) | Strata, 13 min | accepted — seen in browser |
| V-02 | Village find rules (`begin`, `next`, `complete`), medals in the HUD | Strata, 6 min | accepted — driven in browser |
| V-03 | `Guide`: walks a path, waits for the player | Strata, 8 min | accepted — unit-tested, partly seen |
| V-04 | Fence, gate, village and word block sets, `removeBlock` | Strata, 15 min | accepted — driven in browser |
| V-05 | Village game wired in `main.ts` | Strata, 5 min | accepted — driven in browser |

Driven in the browser: Annette asks unprompted; one letter fetched and
delivered by walking (block gone, medal shown); the other fourteen through
the debug hook; gate opened on the fifteenth; Annette set off.

Fixed in review: `FindRules` cleared the wanted letter after emitting
`found`, wiping the next request (regression test added); `Guide` waited
for a player who had run ahead of her (now keeps walking; test added);
a tree and the start point sat where they hid Chuck from the camera.

Not seen: Annette's whole walk and arrival (the automated browser runs at
about a twelfth of real time), any sound, frame rate.

## Written by the architect (not delegated)

Docs, briefs, `AGENTS.md`, `opencode.json`, `package.json`, `tsconfig.json`,
`vite.config.ts`, `.gitignore`, `src/core/contracts.ts`,
`tools/delegate.sh`. Configuration, contracts and orchestration — no game
implementation.

## Known issues

1. TypeScript's platform binary was missing after the first install; an
   agent repaired it with `npm install --no-save`. A clean `npm ci` should
   be right (the lockfile lists it) — to verify.
2. The 27B has only been exercised on the comparison task.

## Waiting on the owner

- Design questions D3–D5 in `ARCHITECTURE.md` §1 (defaults in place; none
  block work).
- Whether to bring the Blender sources in.
