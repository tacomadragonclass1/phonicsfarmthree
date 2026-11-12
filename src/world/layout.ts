import type { ModelId } from '../assets/manifest';

/**
 * Where everything in the village stands. Pure data, owned by the architect.
 *
 * The camera's home view looks along -Z, so on screen +X is right and -Z is
 * "further away". A yaw of 0 shows a building's front to the home camera.
 */

/** Side of one terrain tile, metres. */
export const TILE_SIZE = 26;

/**
 * The one terrain model, laid 3 x 3. Neighbouring tiles are mirrored so the
 * hills meet at every seam (the model's edges are not level).
 */
export const TERRAIN_TILES: readonly { id: string; x: number; z: number; mirrorX: boolean; mirrorZ: boolean }[] = [
  { id: 'terrain', x: 0, z: 0, mirrorX: false, mirrorZ: false },
  { id: 'terrain-w', x: -TILE_SIZE, z: 0, mirrorX: true, mirrorZ: false },
  { id: 'terrain-e', x: TILE_SIZE, z: 0, mirrorX: true, mirrorZ: false },
  { id: 'terrain-n', x: 0, z: -TILE_SIZE, mirrorX: false, mirrorZ: true },
  { id: 'terrain-s', x: 0, z: TILE_SIZE, mirrorX: false, mirrorZ: true },
  { id: 'terrain-nw', x: -TILE_SIZE, z: -TILE_SIZE, mirrorX: true, mirrorZ: true },
  { id: 'terrain-ne', x: TILE_SIZE, z: -TILE_SIZE, mirrorX: true, mirrorZ: true },
  { id: 'terrain-sw', x: -TILE_SIZE, z: TILE_SIZE, mirrorX: true, mirrorZ: true },
  { id: 'terrain-se', x: TILE_SIZE, z: TILE_SIZE, mirrorX: true, mirrorZ: true },
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

/** Static scenery. Ids are generated as `<model>-<index in this list>`. */
export const PROPS: readonly PropPlacement[] = [
  // The lane of shops behind the word row.
  { model: 'cottage', x: 6, z: -7 },
  { model: 'bakery', x: -9, z: -11, yaw: 14 * DEG },
  { model: 'bookshop', x: -2.5, z: -13 },
  { model: 'clockHouse', x: 13, z: -12, yaw: -12 * DEG },
  { model: 'flowerShop', x: 19, z: -6, yaw: -55 * DEG },
  { model: 'workshop', x: -17, z: -5, yaw: 60 * DEG },
  { model: 'windmill', x: -20, z: -22, yaw: 25 * DEG },
  { model: 'woodshed', x: 17, z: 6, yaw: -90 * DEG },
  // The green.
  { model: 'well', x: -10, z: 3 },
  { model: 'bench', x: 9, z: 5.5, yaw: 180 * DEG },
  { model: 'bench', x: -12.5, z: 6, yaw: 150 * DEG },
  { model: 'fingerpost', x: -6.5, z: 7 },
  { model: 'planter', x: 4.1, z: -4.4 },
  { model: 'planter', x: 8.0, z: -4.4 },
  { model: 'wallRun', x: 12, z: -2.5, yaw: -20 * DEG },
  { model: 'wallRun', x: -13.5, z: -1, yaw: 75 * DEG },
  // Trees.
  { model: 'tree', x: -7, z: -6 },
  { model: 'tree', x: 9, z: 1 },
  { model: 'tree', x: -9, z: 9 },
  { model: 'tree', x: 22, z: 3 },
  { model: 'tree', x: -24, z: 8 },
  { model: 'tree', x: 4, z: -20 },
  { model: 'tree', x: -14, z: 18 },
  { model: 'tree', x: 15, z: 19 },
  { model: 'treeB', x: -4.5, z: -8.5 },
  { model: 'treeB', x: 10.5, z: -8 },
  { model: 'treeB', x: 14, z: 11 },
  { model: 'treeB', x: -19, z: 2 },
  { model: 'treeB', x: 2, z: 14 },
  { model: 'treeB', x: 26, z: -14 },
  { model: 'treeB', x: -27, z: -10 },
  { model: 'treeB', x: -6, z: 24 },
  // Small things.
  { model: 'bush', x: 2.9, z: -7.8 },
  { model: 'bush', x: 9.2, z: -6.2 },
  { model: 'bush', x: -11.6, z: -8.6 },
  { model: 'bush', x: -7.6, z: 5.2 },
  { model: 'bush', x: 12.2, z: 8.6 },
  { model: 'bush', x: -16, z: 11 },
  { model: 'mushrooms', x: -8.2, z: 8.4 },
  { model: 'mushrooms', x: 9.8, z: 1.9 },
  { model: 'mushrooms', x: 5, z: 12 },
  { model: 'blossom', x: -5.6, z: 4.6 },
  { model: 'blossom', x: 6.4, z: 3.4 },
  { model: 'blossom', x: -1.2, z: 6.8 },
  { model: 'blossom', x: 11, z: -1 },
  { model: 'blossom', x: -11, z: -3.4 },
];

export const PLAYER_START = { x: 0, z: 3 } as const;

/** Annette waits here, turned toward where Chuck starts. */
export const ANNETTE = { x: -6.5, z: 0.5, yaw: 69 * DEG } as const;

export const BELL = { x: 3.6, z: -3.2 } as const;

/** Ordered LEFT TO RIGHT on screen. */
export const PEDESTALS: readonly { id: string; x: number; z: number }[] = [
  { id: 'stump-1', x: -1.6, z: -3 },
  { id: 'stump-2', x: 0, z: -3 },
  { id: 'stump-3', x: 1.6, z: -3 },
];

export const BLOCKS: readonly { id: string; letter: string; x: number; z: number }[] = [
  { id: 'block-s', letter: 's', x: -4.2, z: 1.0 },
  { id: 'block-a', letter: 'a', x: -2.6, z: 2.2 },
  { id: 'block-t', letter: 't', x: 2.6, z: 2.0 },
  { id: 'block-p', letter: 'p', x: 4.2, z: 0.8 },
  { id: 'block-i', letter: 'i', x: -5.0, z: -1.2 },
  { id: 'block-n', letter: 'n', x: 5.0, z: -1.4 },
  { id: 'block-m', letter: 'm', x: -3.4, z: 4.4 },
  { id: 'block-o', letter: 'o', x: 3.4, z: 4.6 },
];
