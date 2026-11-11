# Progress

Living ledger. Result vocabulary (see `TESTING.md` §4): *unit-tested*,
*seen in browser*, *driven in browser*, *confirmed on device*, *untested*.

## State — 2026-11-11

- Standalone repository `phonicsfarmthree`, local only: `git init` done,
  **no remote** (kept local by decision). Each task is committed as it
  passes review.
- Stage A complete. Stage B (vertical slice) in progress.
- Nothing is viewable in a browser yet; the first runnable page arrives
  with task B-11e.

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
| B-11d | Collider builder | Strata | running | |
| B-11a | Block / pedestal / character views | Strata | queued | |
| B-11b | Page shell, HUD | Strata | queued | |
| B-11c | World builder | — | briefed | |
| B-11e | `main.ts` composition root | — | briefed | |
| B-12 | Browser run-through | — | — | |

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
