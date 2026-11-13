import type { ModelId } from '../assets/manifest';

/**
 * Where everything in the village stands. Pure data, owned by the architect.
 *
 * The camera's home view looks along -Z, so on screen +X is right and -Z is
 * "further away". A yaw of 0 shows a building's front to the home camera.
 */

/**
 * The one terrain model, laid 3 x 3. Neighbouring tiles are mirrored so the
 * hills meet at every seam (the model's edges are not level). The mesh is not
 * centred on its origin (x -13..12.920000076293945, z -12.920000076293945..13), so a mirrored
 * neighbour sits at twice the shared edge's coordinate, not at a round 26.
 */
const E = 25.84;
const W = -26;
const N = -25.84;
const S = 26;

export const TERRAIN_TILES: readonly { id: string; x: number; z: number; mirrorX: boolean; mirrorZ: boolean }[] = [
  { id: 'terrain', x: 0, z: 0, mirrorX: false, mirrorZ: false },
  { id: 'terrain-w', x: W, z: 0, mirrorX: true, mirrorZ: false },
  { id: 'terrain-e', x: E, z: 0, mirrorX: true, mirrorZ: false },
  { id: 'terrain-n', x: 0, z: N, mirrorX: false, mirrorZ: true },
  { id: 'terrain-s', x: 0, z: S, mirrorX: false, mirrorZ: true },
  { id: 'terrain-nw', x: W, z: N, mirrorX: true, mirrorZ: true },
  { id: 'terrain-ne', x: E, z: N, mirrorX: true, mirrorZ: true },
  { id: 'terrain-sw', x: W, z: S, mirrorX: true, mirrorZ: true },
  { id: 'terrain-se', x: E, z: S, mirrorX: true, mirrorZ: true },
];

/** The player may not walk past this distance from the origin on either axis. */
export const WORLD_HALF_EXTENT = 37;

export interface PropPlacement {
  model: ModelId;
  x: number;
  z: number;
  /** World yaw, radians. Default 0. */
  yaw?: number;
}

const DEG = Math.PI / 180;

/**
 * Two places. PHONEME VILLAGE is the southern part of the board (+Z), inside
 * a picket fence; the game starts there. CVC LAND is north of the fence and
 * is reached through the gate once every village letter has been found.
 */
export const VILLAGE_FENCE = {
  /** Corners of the fenced rectangle. */
  west: -21,
  east: 21,
  north: 4,
  south: 36,
  /** The gate is in the north side, centred here. */
  gate: { x: 0, z: 4, width: 3 },
} as const;

/** Static scenery. Ids are generated as `<model>-<index in this list>`. */
export const PROPS: readonly PropPlacement[] = [
  // --- Phoneme Village: the north row faces the square (and the camera).
  { model: 'bakery', x: -12, z: 8.5 },
  { model: 'bookshop', x: -5.5, z: 9 },
  { model: 'clockHouse', x: 6, z: 9 },
  { model: 'flowerShop', x: 13, z: 9.5, yaw: -10 * DEG },
  // West side, doors facing east.
  { model: 'cottage', x: -16.5, z: 17, yaw: 90 * DEG },
  { model: 'workshop', x: -17, z: 26.5, yaw: 90 * DEG },
  // East side, doors facing west.
  { model: 'windmill', x: 16.5, z: 18, yaw: -90 * DEG },
  { model: 'woodshed', x: 17, z: 28, yaw: -90 * DEG },
  // The square.
  { model: 'well', x: -3.5, z: 18 },
  { model: 'bench', x: -5, z: 22.5 },
  { model: 'bench', x: 6, z: 15 },
  { model: 'fingerpost', x: 2.6, z: 6.4 },
  { model: 'planter', x: -13.4, z: 11 },
  { model: 'planter', x: -10.6, z: 11 },
  { model: 'planter', x: 11.4, z: 12.3 },
  { model: 'planter', x: 14.4, z: 12 },
  { model: 'planter', x: -13.6, z: 15.6 },
  { model: 'planter', x: -13.6, z: 18.6 },
  { model: 'wallRun', x: 9, z: 31 },
  { model: 'wallRun', x: -8, z: 33.5 },
  { model: 'tree', x: -9, z: 15.8 },
  { model: 'tree', x: 11, z: 26 },
  { model: 'tree', x: -10, z: 22 },
  { model: 'tree', x: -19, z: 31 },
  { model: 'tree', x: -14, z: 33 },
  { model: 'tree', x: 15, z: 34 },
  { model: 'tree', x: 19, z: 12.5 },
  { model: 'tree', x: -19, z: 10.5 },
  { model: 'treeB', x: 9.8, z: 15.8 },
  { model: 'treeB', x: -12, z: 30 },
  { model: 'treeB', x: 13, z: 23 },
  { model: 'treeB', x: -19, z: 21.5 },
  { model: 'treeB', x: 19.5, z: 23 },
  { model: 'bush', x: -8.6, z: 11.2 },
  { model: 'bush', x: 3.4, z: 10.6 },
  { model: 'bush', x: -14, z: 21.6 },
  { model: 'bush', x: 14.6, z: 14.6 },
  { model: 'bush', x: -6, z: 29 },
  { model: 'bush', x: 5.2, z: 29.6 },
  // The flower patch.
  { model: 'blossom', x: 7.2, z: 22.6 },
  { model: 'blossom', x: 8.7, z: 22.4 },
  { model: 'blossom', x: 9.0, z: 23.6 },
  { model: 'blossom', x: 7.3, z: 23.9 },
  { model: 'blossom', x: 8.1, z: 24.6 },
  // The mushroom ring.
  { model: 'mushrooms', x: -9.9, z: 29.5 },
  { model: 'mushrooms', x: -8.2, z: 29.5 },
  { model: 'mushrooms', x: -9, z: 31 },
  // --- CVC Land, north of the fence.
  { model: 'tree', x: -9, z: -10 },
  { model: 'tree', x: 9.5, z: -11 },
  { model: 'tree', x: -14, z: -2 },
  { model: 'tree', x: 14, z: -3 },
  { model: 'tree', x: 0, z: -17 },
  { model: 'tree', x: -21, z: -13 },
  { model: 'tree', x: 21, z: -15 },
  { model: 'treeB', x: -6, z: -19 },
  { model: 'treeB', x: 8, z: -21 },
  { model: 'treeB', x: -17, z: -8 },
  { model: 'treeB', x: 17, z: -9 },
  { model: 'bush', x: -8, z: -5 },
  { model: 'bush', x: 8.4, z: -5.4 },
  { model: 'bush', x: -3, z: -12 },
  { model: 'blossom', x: -6.5, z: -8.2 },
  { model: 'blossom', x: 6.8, z: -9 },
  { model: 'mushrooms', x: 10.5, z: -1 },
];

export const PLAYER_START = { x: 0, z: 29 } as const;

/** Annette waits here in the village, turned toward where Chuck starts. */
export const ANNETTE = { x: 2.5, z: 25.5, yaw: -35 * DEG } as const;

/**
 * When every village letter is found she walks this way, through the gate,
 * and stops at the last point. Kept clear of every prop: she is not steered.
 */
export const ANNETTE_PATH: readonly { x: number; z: number }[] = [
  { x: 2.5, z: 25.5 },
  { x: 2.8, z: 20 },
  { x: 0.6, z: 14 },
  { x: 0, z: 7 },
  { x: 0, z: 1 },
  { x: -4.5, z: -1.5 },
];

/** The bell in the middle of the village: ringing it starts the letter hunt again. */
export const VILLAGE_BELL = { x: 0, z: 20 } as const;

/**
 * The village letters, each somewhere that means something. `place` is for
 * people reading this file; the game does not use it.
 */
export const VILLAGE_BLOCKS: readonly { id: string; letter: string; x: number; z: number; place: string }[] = [
  { id: 'find-a', letter: 'a', x: -5.5, z: 12.2, place: 'bookshop doorstep' },
  { id: 'find-b', letter: 'b', x: -12, z: 11.6, place: 'bakery doorstep' },
  { id: 'find-c', letter: 'c', x: 13.3, z: 18, place: 'windmill door' },
  { id: 'find-d', letter: 'd', x: -13.3, z: 17.1, place: 'cottage doorstep' },
  { id: 'find-e', letter: 'e', x: -9, z: 30.1, place: 'in the mushroom ring' },
  { id: 'find-f', letter: 'f', x: 8.1, z: 23.3, place: 'in the flower patch' },
  { id: 'find-g', letter: 'g', x: -14, z: 26.5, place: 'workshop door' },
  { id: 'find-h', letter: 'h', x: 6, z: 16.2, place: 'in front of the east bench' },
  { id: 'find-i', letter: 'i', x: -5.6, z: 18.4, place: 'beside the well' },
  { id: 'find-j', letter: 'j', x: -8, z: 34.8, place: 'by the west garden wall' },
  { id: 'find-n', letter: 'n', x: -5, z: 23.7, place: 'in front of the west bench' },
  { id: 'find-o', letter: 'o', x: -8.8, z: 17.5, place: 'under the big tree' },
  { id: 'find-p', letter: 'p', x: 12.9, z: 13.1, place: 'between the flower shop planters' },
  { id: 'find-r', letter: 'r', x: 9, z: 32.3, place: 'by the east garden wall' },
  { id: 'find-s', letter: 's', x: 11, z: 27.1, place: 'under the tree by the woodshed lane' },
  { id: 'find-t', letter: 't', x: 6, z: 12, place: 'clock house doorstep' },
  { id: 'find-u', letter: 'u', x: 2.6, z: 7.9, place: 'at the fingerpost by the gate' },
  { id: 'find-w', letter: 'w', x: 14.6, z: 28, place: 'by the woodshed' },
];

/**
 * Dirt paths, drawn on the ground by the game. Every path runs from one place to
 * another: a door, the bell square, the gate. `width` is in metres.
 */
export const PATHS: readonly { name: string; width: number; points: readonly { x: number; z: number }[] }[] = [
  { name: 'bell square to the gate and on to the word stumps', width: 2, points: [
    { x: 0, z: 18 }, { x: 0, z: 13.2 }, { x: 0, z: 4 }, { x: 0, z: -5.5 },
  ] },
  { name: 'bell square south to the garden walls', width: 2, points: [
    { x: 0, z: 22 }, { x: 0, z: 29 }, { x: 0, z: 31.8 }, { x: 0, z: 32.9 },
  ] },
  { name: 'west garden wall', width: 1.4, points: [{ x: 0, z: 31.8 }, { x: -4, z: 32.4 }, { x: -8, z: 32.4 }] },
  { name: 'east garden wall', width: 1.4, points: [{ x: 0, z: 31.8 }, { x: 4.5, z: 33 }, { x: 9, z: 33 }] },
  { name: 'shop street', width: 1.8, points: [
    { x: -12, z: 13.2 }, { x: -5.5, z: 13.4 }, { x: 0, z: 13.2 }, { x: 6, z: 13.3 }, { x: 13, z: 14 },
  ] },
  { name: 'bakery door', width: 1.3, points: [{ x: -12, z: 13.2 }, { x: -12, z: 10.8 }] },
  { name: 'bookshop door', width: 1.3, points: [{ x: -5.5, z: 13.4 }, { x: -5.5, z: 11.4 }] },
  { name: 'clock house door', width: 1.3, points: [{ x: 6, z: 13.3 }, { x: 6, z: 11.2 }] },
  { name: 'flower shop door', width: 1.3, points: [{ x: 13, z: 14 }, { x: 13, z: 12 }] },
  { name: 'cottage door', width: 1.4, points: [{ x: -2, z: 20.4 }, { x: -8.5, z: 19.8 }, { x: -13.9, z: 17.1 }] },
  { name: 'workshop door', width: 1.4, points: [{ x: -1.4, z: 21.6 }, { x: -6.5, z: 25.6 }, { x: -13.6, z: 26.5 }] },
  { name: 'windmill door', width: 1.4, points: [{ x: 2, z: 19.6 }, { x: 8, z: 18.6 }, { x: 13.8, z: 18 }] },
  { name: 'woodshed', width: 1.4, points: [{ x: 1.4, z: 21.6 }, { x: 6.5, z: 28.2 }, { x: 14.8, z: 28.5 }] },
];

/** Round patches of bare ground: the bell square and the clearing the word stumps stand in. */
export const PATCHES: readonly { name: string; x: number; z: number; radius: number }[] = [
  { name: 'bell square', x: 0, z: 20, radius: 3 },
  { name: 'word clearing', x: 0.6, z: -7.6, radius: 4.4 },
];

export const BELL = { x: 3.6, z: -8.2 } as const;

/** Ordered LEFT TO RIGHT on screen. */
export const PEDESTALS: readonly { id: string; x: number; z: number }[] = [
  { id: 'stump-1', x: -1.6, z: -8 },
  { id: 'stump-2', x: 0, z: -8 },
  { id: 'stump-3', x: 1.6, z: -8 },
];

/** The word-building blocks, in CVC Land. */
export const BLOCKS: readonly { id: string; letter: string; x: number; z: number }[] = [
  { id: 'block-s', letter: 's', x: -4.4, z: -5 },
  { id: 'block-a', letter: 'a', x: -2.6, z: -3.6 },
  { id: 'block-t', letter: 't', x: 2.6, z: -3.8 },
  { id: 'block-p', letter: 'p', x: 4.4, z: -5.2 },
  { id: 'block-i', letter: 'i', x: -5.4, z: -7.2 },
  { id: 'block-n', letter: 'n', x: 5.4, z: -7.4 },
  { id: 'block-m', letter: 'm', x: -3.6, z: -2 },
  { id: 'block-o', letter: 'o', x: 3.6, z: -2.2 },
];
