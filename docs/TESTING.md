# Testing

Living document. Rule zero: **a green suite proves positions, not pictures.**
A character can be drawn facing the wrong way while every assertion about
where he stands passes. So there are three layers here and the third is not
optional.

## 1. Unit tests — Vitest, Node (`npm test`)

Everything in `src/core` and `src/game`, plus the pure parts of camera,
input and audio, runs without a browser.

| Area | What is asserted |
|---|---|
| Loop | first tick, step count, sub-step clamp, alpha, error isolation, start/stop |
| Carry rules | what can be picked up and when, placing and retrieving, the drop search, line of sight, drop height |
| Blocks/pedestals | reciprocal references stay consistent; one block per pedestal; letter is one lowercase char |
| Sequencer | replace-on-play, `letterStarted` order, finished vs cancelled, unknown keys skipped |
| Bell/word check | all 8 occupancy patterns, word vs non-word, re-check on removal |
| Find-it round | right/wrong flow, never asks for a missing letter, pause/resume, new board |
| Annette | whatever hinting behaviour is designed for her |
| Camera rig | deadzone, lead, yaw clamp ±55°, ease-home delay, pull-in on a blocked cast, minimum distance |
| Input | device merge, latched action edge survives a sub-frame tap, tap vs drag vs second finger, focus-loss release, gamepad connect/disconnect |
| Letters | every letter a–z maps to a texture key; orientation table for the five faces |
| Manifest | every url exists under `public/` |

Agents write tests with their code. The architect additionally keeps
**acceptance tests the agent has not seen** for contract-level behaviour and
runs them during review.

## 2. Static checks

`npm run typecheck` (strict, no unused). `npm run build` must succeed before
any browser check — a dev-server pass is not a build pass.

## 3. Browser checks — the real camera, the real build

Run against `npm run build && npm run preview`, in Chrome. The game exposes
`window.__pf` (debug builds and `?debug`) with read-only state and a few
drivers: `teleport`, `press(action)`, `state()`.

Checklist for the vertical slice (extended each stage):

1. Loads with no console errors; every manifest asset resolves (network tab).
2. Screenshot at spawn: Chuck prominent, horizon in frame, block letter legible; measure the letter's pixel height.
3. Walk in four screen directions: Chuck is **drawn** facing his travel (screenshot each).
4. Walk into the block → carried, phoneme plays (audio context `running`, sequencer event logged).
5. Action at the pedestal → block snapped upright, letter facing the camera side, phoneme plays.
6. Action again empty-handed → retrieved. Action in the open → dropped in front, not inside anything.
7. Walk into the cottage and the tree trunk → stopped; camera does not clip through the cottage when Chuck stands behind it.
8. Walk up and down the terrain slope → no sinking, camera height follows.
9. Resize to 1280×800, 1920×1080 and a portrait phone size.
10. Frame time over a 20 s walk; draw calls and texture memory from `renderer.info`.

Device checks that cannot be automated and are **reported as untested until
a person does them**: a physical Xbox pad (connect, disconnect mid-walk,
reconnect), a real multitouch screen (drag + second-finger tap, two-finger
camera swing), audio on the classroom screen.

## 4. Reporting rule

A result is written as one of: *unit-tested*, *seen in browser* (with the
screenshot path), *driven in browser*, *confirmed on device by the owner*,
or *untested*. Nothing is called verified on the strength of a lower layer.
