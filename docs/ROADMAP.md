# Roadmap

Living document. Each stage ends on something that can be played, and
nothing is called done until it has been seen in a real browser.

## Stage A — foundations  (done)

Repository, toolchain, local-model delegation, model comparison,
architecture, contracts, asset import.

## Stage B — vertical slice  (in progress)

One small place that is genuinely playable: a patch of terrain, one cottage,
one tree, Chuck, one letter block, one stump, the follow camera, pick up /
put down / place on the stump, the letter's sound on every handling, the
full look.

| Wave | Task | Owns | State |
|---|---|---|---|
| 1 | B-01 `Emitter`, `math` | `src/core/` | accepted |
| 2 | B-02 asset manifest | `src/assets/manifest.ts` | running |
| 2 | B-05 `PhonemeSequencer`, `AudioEngine` | `src/audio/` | queued |
| 2 | B-08 follow camera rig | `src/camera/` | queued |
| 2 | B-07 physics world + character | `src/physics/` | queued |
| 3 | B-03 `AssetLibrary` | `src/assets/AssetLibrary.ts` | briefed |
| 3 | B-09 painted material, ink outline, lighting | `src/assets/look/` | briefed |
| 3 | B-10 letter faces | `src/world/Letter*.ts` | briefed |
| 3 | B-04 input | `src/input/` | briefed |
| 3 | B-06 carry rules | `src/game/` | briefed |
| 4 | B-11 views, scene assembly, `main.ts` | `src/world/`, `src/main.ts` | not briefed |
| 4 | B-12 browser run-through and fixes | as found | — |

D1/D2 are the pick-up and touch-control questions in `ARCHITECTURE.md` §1.

## Stage C — the three activities

Hear it, Build it (three stumps + bell + word check), Find it (Annette).

## Stage D — input and interface

Touch layout for small hands, gamepad on a real pad, focus loss, loading and
error screens, tap-to-start, accessibility and low-vision checks, resize.

## Stage E — the world

Decide the world's shape (D4), build its ground, place buildings and props
with intent, occlusion fade, performance pass on modest hardware. New
Blender work only for listed gaps.

## Stage F — validation and deployment

Full checklist on Chrome desktop, a touch device and a real gamepad, then a
GitHub Pages deployment for this repository — only on the owner's say-so.

## Standing risks

1. One GPU, one model at a time: delegation is serial.
2. Whether the art holds up under a close perspective camera.
3. Texture memory on classroom hardware once many models are loaded.
