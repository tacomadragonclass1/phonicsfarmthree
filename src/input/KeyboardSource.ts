import type { InputSource, InputState } from '../core/contracts';
import type { EventTargetLike } from './InputManager';

export interface KeyboardEventLike {
  /** Physical key, so the layout is not affected by modifiers or locale. */
  code: string;
  /** Auto-repeat of a held key: the action latch must ignore it. */
  repeat: boolean;
  preventDefault(): void;
}

export interface KeyboardEvents {
  keydown: KeyboardEventLike;
  keyup: KeyboardEventLike;
  blur: unknown;
}

type WalkKey = { axis: 'x' | 'y'; sign: number };

/** +y is down the screen, so W is -1. Diagonals are not normalised here. */
const WALK_KEYS: ReadonlyMap<string, WalkKey> = new Map<string, WalkKey>([
  ['KeyW', { axis: 'y', sign: -1 }],
  ['ArrowUp', { axis: 'y', sign: -1 }],
  ['KeyS', { axis: 'y', sign: 1 }],
  ['ArrowDown', { axis: 'y', sign: 1 }],
  ['KeyA', { axis: 'x', sign: -1 }],
  ['ArrowLeft', { axis: 'x', sign: -1 }],
  ['KeyD', { axis: 'x', sign: 1 }],
  ['ArrowRight', { axis: 'x', sign: 1 }],
]);

const CAMERA_KEYS: ReadonlyMap<string, number> = new Map<string, number>([
  ['KeyQ', -1],
  ['KeyC', 1],
]);

const ACTION_KEYS = new Set(['KeyE', 'Space']);

/** These scroll the page, so the game must swallow them. */
const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class KeyboardSource implements InputSource {
  private readonly target: EventTargetLike<KeyboardEvents>;
  private readonly held = new Set<string>();
  private actionLatched = false;

  constructor(target: EventTargetLike<KeyboardEvents>) {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEventLike): void => {
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    // KeyE is the action and is never a camera key.
    if (ACTION_KEYS.has(event.code)) {
      if (!event.repeat) this.actionLatched = true;
      return;
    }
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEventLike): void => {
    this.held.delete(event.code);
  };

  /** Focus lost: whatever was held is no longer held. */
  private readonly onBlur = (): void => this.release();

  sample(out: InputState): void {
    for (const code of this.held) {
      const walk = WALK_KEYS.get(code);
      if (walk) {
        if (walk.axis === 'x') out.moveX += walk.sign;
        else out.moveY += walk.sign;
      }
      const camera = CAMERA_KEYS.get(code);
      if (camera !== undefined) out.cameraYaw += camera;
    }

    if (this.actionLatched) {
      out.action = true;
      this.actionLatched = false;
    }
  }

  release(): void {
    this.held.clear();
    this.actionLatched = false;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.release();
  }
}
