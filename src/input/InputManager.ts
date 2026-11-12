import type { InputSource, InputState } from '../core/contracts';
import { clamp, limitLength2 } from '../core/math';

/**
 * Minimal structural event source. Kept generic over the event map so a real
 * DOM EventTarget satisfies it, while tests can inject a fake one; nothing
 * here touches window, document or navigator.
 */
export interface EventTargetLike<Events> {
  addEventListener<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): void;
  removeEventListener<K extends keyof Events>(type: K, listener: (event: Events[K]) => void): void;
}

/** Merges every device into one InputState; gameplay never asks which device. */
export class InputManager {
  private readonly sources: readonly InputSource[];

  /** Reused every step: the caller must not keep it across samples. */
  private readonly state: InputState = { moveX: 0, moveY: 0, action: false, jump: false, cameraYaw: 0 };

  constructor(sources: InputSource[]) {
    this.sources = sources;
  }

  sample(): InputState {
    const out = this.state;
    out.moveX = 0;
    out.moveY = 0;
    out.action = false;
    out.jump = false;
    out.cameraYaw = 0;

    for (const source of this.sources) source.sample(out);

    // Sources add, so a merged move can be longer than one device's input.
    const move = limitLength2(out.moveX, out.moveY, 1);
    out.moveX = move.x;
    out.moveY = move.y;
    out.cameraYaw = clamp(out.cameraYaw, -1, 1);
    return out;
  }

  releaseAll(): void {
    for (const source of this.sources) source.release();
  }

  dispose(): void {
    for (const source of this.sources) source.dispose();
  }
}
