/**
 * The single typed list of what the game loads. Pure data with no imports so
 * the loader, the tests and the build can all read it without pulling in three.
 */

export type ColliderSpec =
  | { kind: 'cylinder'; radius: number; height: number; offset: [number, number, number] }
  | { kind: 'box'; halfExtents: [number, number, number]; offset: [number, number, number] }
  | { kind: 'trimesh' } // use the model's own triangles
  | { kind: 'none' };

export interface ModelEntry {
  /** URL relative to the site base, e.g. 'assets/models/foundation_tree.glb'. */
  url: string;
  /** Animation clip names the game relies on. */
  clips: readonly string[];
  collider: ColliderSpec;
  /** True when the camera must not pass through it. */
  blocksCamera: boolean;
  castsShadow: boolean;
}

export const MODELS = {
  chuck: {
    url: 'assets/models/foundation_chuck.glb',
    clips: ['idle', 'walk'],
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  annette: {
    url: 'assets/models/village/annette.glb',
    clips: ['idle', 'walk'],
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  block: {
    url: 'assets/models/foundation_block.glb',
    clips: [],
    collider: { kind: 'box', halfExtents: [0.4, 0.4, 0.4], offset: [0, 0.4, 0] },
    blocksCamera: false,
    castsShadow: true,
  },
  pedestalPost: {
    url: 'assets/models/cvc/pedestal_post.glb',
    clips: [],
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  pedestalCap: {
    url: 'assets/models/cvc/pedestal_cap.glb',
    clips: [],
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  bell: {
    url: 'assets/models/cvc/bell.glb',
    clips: [],
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  bellFrame: {
    url: 'assets/models/cvc/bell_frame.glb',
    clips: [],
    // The two posts and head beam, as one slab.
    collider: { kind: 'box', halfExtents: [0.71, 0.875, 0.2], offset: [0, 0.875, 0] },
    blocksCamera: false,
    castsShadow: true,
  },
  terrain: {
    url: 'assets/models/foundation_terrain.glb',
    clips: [],
    collider: { kind: 'trimesh' },
    blocksCamera: true,
    castsShadow: false,
  },
  tree: {
    url: 'assets/models/foundation_tree.glb',
    clips: [],
    // Footprint measured on the mesh: the trunk is not centred on the origin.
    collider: { kind: 'cylinder', radius: 0.3, height: 3.1, offset: [0.03, 1.55, 0.05] },
    blocksCamera: false,
    castsShadow: true,
  },
  cottage: {
    url: 'assets/models/foundation_cottage.glb',
    clips: [],
    collider: {
      kind: 'box',
      halfExtents: [1.861, 1.974, 1.822],
      offset: [0.061, 1.968, 0.268],
    },
    blocksCamera: true,
    castsShadow: true,
  },
  bakery: {
    url: 'assets/models/village/bakery.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [1.941, 2.03, 1.841], offset: [-0.109, 2.03, 0.297] },
    blocksCamera: true,
    castsShadow: true,
  },
  bookshop: {
    url: 'assets/models/village/bookshop.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [1.76, 2.362, 1.887], offset: [0.014, 2.358, 0.373] },
    blocksCamera: true,
    castsShadow: true,
  },
  clockHouse: {
    url: 'assets/models/village/clock_house.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [1.304, 3.39, 1.646], offset: [0.001, 3.23, 0.404] },
    blocksCamera: true,
    castsShadow: true,
  },
  flowerShop: {
    url: 'assets/models/village/flower_shop.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [1.79, 1.472, 1.867], offset: [-0.049, 1.468, 0.363] },
    blocksCamera: true,
    castsShadow: true,
  },
  workshop: {
    url: 'assets/models/village/workshop.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [2.715, 1.671, 1.767], offset: [0.575, 1.669, 0.073] },
    blocksCamera: true,
    castsShadow: true,
  },
  windmill: {
    url: 'assets/models/village/windmill.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [2.216, 3.383, 1.713], offset: [0.0, 3.383, 0.327] },
    blocksCamera: true,
    castsShadow: true,
  },
  well: {
    url: 'assets/models/village/well.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'cylinder', radius: 0.877, height: 2.45, offset: [0.018, 1.215, -0.002] },
    blocksCamera: false,
    castsShadow: true,
  },
  bench: {
    url: 'assets/models/village/bench.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [0.923, 0.413, 0.232], offset: [0.003, 0.409, -0.028] },
    blocksCamera: false,
    castsShadow: true,
  },
  fingerpost: {
    url: 'assets/models/village/fingerpost.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'cylinder', radius: 0.25, height: 2.325, offset: [0, 1.158, 0] },
    blocksCamera: false,
    castsShadow: true,
  },
  planter: {
    url: 'assets/models/village/planter.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'cylinder', radius: 0.317, height: 0.931, offset: [0.0, 0.465, 0.0] },
    blocksCamera: false,
    castsShadow: true,
  },
  bush: {
    url: 'assets/models/village/bush.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'cylinder', radius: 0.729, height: 0.931, offset: [0.014, 0.439, 0.032] },
    blocksCamera: false,
    castsShadow: true,
  },
  treeB: {
    url: 'assets/models/village/tree_b.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'cylinder', radius: 0.25, height: 3.35, offset: [0, 1.651, 0] },
    blocksCamera: false,
    castsShadow: true,
  },
  wallRun: {
    url: 'assets/models/village/wall_run.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [2.294, 0.366, 0.413], offset: [-0.007, 0.362, -0.139] },
    blocksCamera: false,
    castsShadow: true,
  },
  mushrooms: {
    url: 'assets/models/village/mushrooms.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  blossom: {
    url: 'assets/models/village/blossom.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'none' },
    blocksCamera: false,
    castsShadow: true,
  },
  woodshed: {
    url: 'assets/models/cvc/woodshed.glb',
    clips: [],
    // Collider from the mesh bounds.
    collider: { kind: 'box', halfExtents: [1.645, 1.125, 1.168], offset: [0.0, 1.125, 0.0] },
    blocksCamera: true,
    castsShadow: true,
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelId = keyof typeof MODELS;

export interface AudioEntry {
  url: string;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const VOICE = ['annette_find', 'annette_good', 'wrong_chime'];

function buildSounds(): Record<string, AudioEntry> {
  const sounds: Record<string, AudioEntry> = {};
  for (const letter of LETTERS) sounds[letter] = { url: `assets/audio/phonemes/${letter}.wav` };
  for (const name of VOICE) sounds[name] = { url: `assets/audio/voice/${name}.wav` };
  return sounds;
}

export const SOUNDS: Record<string, AudioEntry> = buildSounds();

export const FONT = { url: 'assets/fonts/Fredoka.ttf', family: 'Fredoka', weight: 600 } as const;

/** Every url the game loads (models, sounds, font), de-duplicated. */
export function allUrls(): string[] {
  const urls = new Set<string>();
  for (const model of Object.values(MODELS)) urls.add(model.url);
  for (const sound of Object.values(SOUNDS)) urls.add(sound.url);
  urls.add(FONT.url);
  return [...urls];
}
