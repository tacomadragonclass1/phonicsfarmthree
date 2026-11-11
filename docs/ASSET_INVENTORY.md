# Asset inventory

Living document. Everything the game can load lives in `public/assets/`.
Figures were read from the GLB headers on 2026-11-11.

All models are original Blender work made for Phonics Farm. They were copied
into this repository as plain files; the Blender sources (`.blend` files and
their build scripts) remain in the earlier project's `art_src/` and have not
been brought across yet (see "Open" below). No third-party model packs are
used.

Every model has the same shape: **one mesh (or a few named nodes), one
material, one embedded PNG base-colour texture, metallic 0, roughness ≈ 0.93,
no extensions, no compression.**

## Characters — `public/assets/models/`

| File | Tris | Rig | Clips | Size (m) |
|---|---|---|---|---|
| `foundation_chuck.glb` | 4,580 | 14 bones | `idle`, `walk` | 0.77 × 1.35 × 0.72 |
| `village/annette.glb` | 4,376 | 14 bones | `idle`, `walk` | 0.71 × 1.58 × 0.70 |

Both face local +Z and share bone names.

## Letter block and stage pieces

| File | Tris | Notes |
|---|---|---|
| `foundation_block.glb` | 3,714 | 0.85 m cube. Nodes `Cube` (textured body) and `Front/Back/Left/Right/Top` (flat cream faces). No letters in the model. |
| `cvc/pedestal_post.glb`, `cvc/pedestal_cap.glb` | 264 / 208 | A sawn stump in two parts (so the cap can rise). |
| `cvc/bell.glb`, `cvc/bell_frame.glb` | — | A bell on a timber frame. |

## Environment

| File | Tris | Size (m) | Notes |
|---|---|---|---|
| `foundation_terrain.glb` | 13,122 | 26 × 2.5 × 26 | Rolling ground patch. The slice's terrain. |
| `foundation_tree.glb` | 5,128 | 2.6 × 3.1 × 1.9 | Broadleaf tree with open canopy. |
| `village/tree_b.glb` | 3,494 | 1.6 × 3.4 × 1.0 | A second, taller species. |
| `foundation_cottage.glb` | 3,674 | 3.7 × 4.0 × 3.6 | Front is local +Z. |
| `village/bakery, bookshop, clock_house, flower_shop, windmill, workshop` | ~3,000 each | ~3.9 × 4.1 × 3.7 | Six distinct buildings. Front is local +Z. |
| `village/bench, blossom, bunting, bush, fingerpost, mushrooms, planter, well, mill_mound, lane_stone, wall_run` | small | — | Props. |
| `cvc/river, handcart, woodshed, troll` | — | — | Further set pieces. |
| `foundation_garden.glb`, `foundation_props.glb` | — | — | Multi-object kits. |

Not copied in: the 148 × 188 m sculpted world ground (23 MB, almost all one
4096² texture). It was shaped for a different layout; this game will decide
its own ground (see `ROADMAP.md`).

## Audio — `public/assets/audio/`

| Files | Notes |
|---|---|
| `phonemes/a.wav … z.wav` | One human recording per letter sound. Used with permission for non-profit educational use, attribution requested — see `licenses/pronunciation-studio-permission.md`. `c` and `k` are the same recording. |
| `voice/annette_find.wav`, `voice/annette_good.wav` | "Please find the letter that says…" and "Good job" — the owner's own recordings. |
| `voice/wrong_chime.wav` | A soft two-note chime, synthesised. |

## Font — `public/assets/fonts/Fredoka.ttf`

SIL Open Font License (`licenses/Fredoka-OFL.txt`). Used at weight 600.
Verified by rendering the glyph: its lowercase `a` is single-storey.

## Gaps — reported, not papered over

1. **No carry, pick-up or celebrate animation.** Chuck has only `idle` and
   `walk`. Holding a block will look like walking with a block floating in
   front of him until a pose is made in Blender.
2. **No voice lines beyond two.** Any new prompt ("Can you make a word?",
   a greeting, a word read aloud) needs recording.
3. **No word audio.** The game can sound letters in sequence but cannot say
   the blended word.
4. **No ground for a full world.** One 26 m terrain patch exists.
5. **No UI art** (button, icons). To be drawn or built in CSS.

## Open

- Whether to bring the Blender sources into this repository so it is fully
  self-contained (158 MB), or leave them where they are.
- A word list for "is this a word?" — the earlier project's 870-word list
  (SCOWL-derived, licence in `licenses/`) is available to reuse; this game
  may prefer a hand-picked CVC list a teacher can read.
