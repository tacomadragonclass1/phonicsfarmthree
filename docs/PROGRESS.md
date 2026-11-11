# Progress

Living ledger. Result vocabulary (see `TESTING.md` §4): *unit-tested*,
*seen in browser*, *driven in browser*, *confirmed on device*, *untested*.

## State — 2026-11-11

- Standalone repository `phonicsfarmthree`, local only: `git init` done,
  **no commits, no remote**. Committing and creating a GitHub repo wait for
  the owner's word.
- Stage A complete. Stage B (vertical slice) in progress.
- Nothing is viewable in a browser yet; the first runnable page arrives
  with task B-11.

## Task ledger

| ID | Task | Model | State | Review notes |
|---|---|---|---|---|
| EVAL-001 | Fixed-step loop + Bobber + tests (model comparison) | Strata, 27B | accepted — Strata's files kept | Both passed 8/8 hidden acceptance tests. |
| B-01 | `Emitter`, `math` | Strata | accepted — unit-tested | 547 s. Clean typing for void events; 30 tests. |
| B-02 | Asset manifest | Strata | running | |
| B-05 | `PhonemeSequencer`, `AudioEngine` | Strata | queued | |
| B-08 | Follow camera rig | Strata | queued | |
| B-07 | Physics world + character | Strata | queued | |
| B-03 | `AssetLibrary` | — | briefed | |
| B-09 | Painted material, ink outline, lighting | — | briefed | |
| B-10 | Letter faces | — | briefed | |
| B-04 | Input | — | briefed, on hold | Depends on design questions D1/D2. |
| B-06 | Carry rules | — | briefed, on hold | Depends on D1. |
| B-11 | Views, scene assembly, `main.ts` | — | not briefed | |
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

- Design questions D1–D5 in `ARCHITECTURE.md` §1 (defaults are in place, so
  only D1/D2 hold any work).
- First commit; GitHub repository; whether to bring the Blender sources in.
