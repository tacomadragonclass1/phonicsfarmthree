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
