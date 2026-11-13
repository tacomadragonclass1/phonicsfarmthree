/**
 * Shared contracts. OWNED BY THE ARCHITECT -- implementation agents must not
 * edit this file. If a contract looks wrong, say so in your report instead.
 *
 * Conventions: metres, seconds, radians. Y is up. Characters face local +Z.
 * A yaw of 0 faces +Z and yaw = atan2(x, z). ALL yaw values are WORLD yaw.
 * This file has no imports on purpose: `core` and `game` must stay free of
 * three.js, Rapier, DOM and audio types.
 */

// ---------------------------------------------------------------- basics ---

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Anything advanced by the fixed-timestep simulation. */
export interface Updatable {
  /** @param dt fixed step in seconds (always the loop's `step`). */
  update(dt: number): void;
}

/** Anything that owns GPU, audio or DOM resources. */
export interface Disposable {
  dispose(): void;
}

/** Removes the listener it was returned for. */
export type Unsubscribe = () => void;

/** Minimal typed event source. `Events` maps an event name to its payload. */
export interface EventSource<Events> {
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): Unsubscribe;
}

// ------------------------------------------------------------------ loop ---

/** Options for the fixed-timestep loop. */
export interface FixedStepOptions {
  /** Simulation step in seconds. Default 1/60. Must be finite and > 0. */
  step?: number;
  /** Most simulation steps run per frame before time is dropped. Default 5. */
  maxSubSteps?: number;
  /** Called `n` times per frame with the fixed step. */
  simulate: (dt: number) => void;
  /**
   * Called once per frame after simulating. `alpha` in [0,1) is how far the
   * frame sits between the last two simulation states; `frameDt` is the real
   * (clamped) frame time in seconds.
   */
  render: (alpha: number, frameDt: number) => void;
  /** Receives anything thrown by simulate/render. The loop keeps running. */
  onError?: (error: unknown) => void;
}

// ----------------------------------------------------------------- input ---

/**
 * One simulation step's worth of player intent, already merged across every
 * device. Gameplay reads this and never asks which device it came from.
 */
export interface InputState {
  /** Screen-space walk vector, length <= 1. +x is screen-right. */
  moveX: number;
  /** +y is DOWN the screen (toward the viewer), matching pointer coordinates. */
  moveY: number;
  /** True for exactly one simulation step per press of the action. */
  action: boolean;
  /** True for exactly one simulation step per press of jump. */
  jump: boolean;
  /** Camera swing rate in [-1, 1]. Positive swings the view to the right. */
  cameraYaw: number;
  /** Camera tilt rate in [-1, 1]. Positive lifts the camera for a view from higher up. */
  cameraPitch: number;
  /** Camera zoom rate in [-1, 1]. Positive moves the camera closer. */
  cameraZoom: number;
  /** True for one simulation step per press of "put the camera back". */
  cameraReset: boolean;
}

/**
 * A device adapter. `sample` is called once per simulation step and ADDS its
 * contribution into `out` (the manager zeroes `out` first and clamps after).
 * A press of the action must be latched inside the source until the next
 * `sample`, so a tap shorter than one step is never lost.
 */
export interface InputSource extends Disposable {
  sample(out: InputState): void;
  /** Drop everything held (focus lost, pointer cancelled, pad unplugged). */
  release(): void;
}

// ----------------------------------------------------------------- audio ---

export interface SoundEvents {
  /** A clip in the current sequence began playing. Payload: its key. */
  letterStarted: string;
  /** The whole sequence played to its end. */
  sequenceFinished: void;
  /** The sequence was replaced or stopped before finishing. */
  sequenceCancelled: void;
}

/**
 * The game's one voice. Keys are a lowercase letter ('a'..'z') or a voice
 * line ('annette_find', 'annette_good', 'wrong_chime').
 *
 *  - `playSequence` REPLACES whatever is playing and whatever is queued.
 *    Replacing an unfinished sequence emits `sequenceCancelled` first.
 *  - Unknown keys are skipped silently. An empty (or all-unknown) list just
 *    stops; it emits neither `letterStarted` nor `sequenceFinished`.
 *  - Clips play strictly one after another; `letterStarted` fires as each
 *    one begins; `sequenceFinished` fires once after the last one ends.
 */
export interface SoundPlayer extends EventSource<SoundEvents> {
  playSequence(keys: readonly string[]): void;
  stop(): void;
  /** True while a clip is playing or more are queued. */
  readonly busy: boolean;
}

// ----------------------------------------------------------------- world ---

/** Collision groups, as bit flags. */
export const Layer = {
  World: 1,
  Player: 2,
  Block: 4,
  Pedestal: 8,
} as const;

/**
 * What gameplay rules may ask about the physical world. Implemented by the
 * physics module; faked in unit tests. `ignoreIds` are entity ids (block or
 * pedestal ids) whose colliders must not count.
 */
export interface WorldQuery {
  /**
   * Line of sight between two points against World, Block and Pedestal
   * colliders. True when nothing is hit, or everything hit is in `ignoreIds`.
   */
  canReach(from: Vec3, to: Vec3, ignoreIds?: readonly string[]): boolean;
  /**
   * Height of World ground under (x, z), looking DOWN from `fromY`. Null when
   * there is nothing below within 8 m. Surfaces above `fromY` are not seen.
   */
  groundHeight(x: number, z: number, fromY: number): number | null;
  /**
   * True when an axis-aligned box touches no World, Player, Block or
   * Pedestal collider (other than `ignoreIds`).
   */
  isBoxClear(center: Vec3, halfExtents: Vec3, ignoreIds?: readonly string[]): boolean;
}

/** What the camera rig may ask. Implemented by physics; faked in tests. */
export interface CameraProbe {
  /**
   * Sweep a sphere from `from` to `to` against camera-blocking colliders.
   * Returns the fraction of the way (0..1) at which it first touches, or 1
   * when the path is clear.
   */
  sweep(from: Vec3, to: Vec3, radius: number): number;
}

// ------------------------------------------------------------ game state ---

export interface BlockState {
  readonly id: string;
  /** One lowercase letter. */
  readonly letter: string;
  /** Bottom-centre of the block. Stale while carried. */
  position: Vec3;
  carried: boolean;
  /** Id of the pedestal it rests on, or null. */
  pedestalId: string | null;
  /** Village blocks land without sounding (it would cut the guide off). */
  silentDrops: boolean;
}

export interface PedestalState {
  readonly id: string;
  /** Bottom-centre of the pedestal. */
  readonly position: Vec3;
  /** Height of the snap point above `position.y`. */
  readonly snapHeight: number;
  blockId: string | null;
}

/** Something the action can trigger when Chuck is next to it (the bell). */
export interface Activatable {
  readonly id: string;
  readonly position: Vec3;
  activate(): void;
}

/** Player tunables. One place, so feel can be tuned without hunting. */
export const PlayerTuning = {
  walkSpeed: 6.4,
  acceleration: 32,
  /** Take-off speed; with the character's gravity of 20 this is a hop of about 0.9 m. */
  jumpSpeed: 6,
  /** How close Chuck must be for something to light up and be actionable. */
  interactionDistance: 1.65,
  /** The lit target only changes when another is nearer by more than this. */
  focusHysteresis: 0.15,
  dropDistance: 1.12,
  /** Tried in this order, relative to the heading, in degrees. */
  dropAngles: [0, 45, -45, 90, -90, 135, -135, 180],
  dropHalfExtents: { x: 0.42, y: 0.38, z: 0.42 },
  /** Chest height the reach ray starts from, and target height it aims at. */
  reachFromHeight: 0.6,
  reachToHeight: 0.4,
  turnRate: 14,
} as const;

/** The one thing the action would act on right now. It is what lights up. */
export type FocusTarget =
  | { kind: 'block'; block: BlockState }
  | { kind: 'pedestal'; pedestal: PedestalState }
  | { kind: 'activatable'; target: Activatable };

export interface CarryEvents {
  /** The lit target changed (null = nothing in reach). */
  focusChanged: FocusTarget | null;
  /** Chuck took a block into his hands (from the ground or a pedestal). */
  pickedUp: BlockState;
  /** A block was put on the ground. */
  dropped: BlockState;
  /** A block was snapped onto a pedestal. */
  placed: { block: BlockState; pedestal: PedestalState };
  /** A block was taken off a pedestal (fires before `pickedUp`). */
  removed: { block: BlockState; pedestal: PedestalState };
}

/** What the word-building row reports. Nothing here is a failure state. */
export interface WordEvents {
  /** The bell was rung with no blocks on the row. */
  nothingToSound: void;
  /** A block on the row is being sounded. `index` counts filled stumps from the left. */
  letterSounded: { index: number; pedestalId: string; blockId: string; letter: string };
  /** Every stump is filled and the letters make a word. */
  wordMade: { word: string; blockIds: readonly string[] };
  /** The sounds were played but they are not (yet) a word. */
  notYet: { letters: string };
}

/** What the "find the sound" helper reports. Nothing here is a failure state. */
export interface FindEvents {
  /** She asked for a sound (also fired when she repeats the request). */
  asked: { letter: string };
  /** The child brought the block she asked for. */
  found: { letter: string; blockId: string };
  /** The child brought a different block; she names its sound and asks again. */
  tryAgain: { wanted: string; brought: string };
  /** A find left no letters to ask for. Fires after that find's `found`. */
  complete: void;
}

/** A character leading the player along a path. */
export interface GuideEvents {
  /** She reached the end of the path. */
  arrived: void;
}
