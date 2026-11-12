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
