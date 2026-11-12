import type { InputSource, InputState, Vec3 } from './core/contracts';

/**
 * Console-driven input: the values it is told to hold, plus a latched press.
 * It is one of the InputManager sources, so the console drives the same path a
 * pad does and nothing in the game has to know it exists.
 */
export class DebugSource implements InputSource {
  private moveX = 0;
  private moveY = 0;
  private cameraYaw = 0;
  private latched = false;

  hold(moveX: number, moveY: number, cameraYaw = 0): void {
    this.moveX = moveX;
    this.moveY = moveY;
    this.cameraYaw = cameraYaw;
  }

  press(): void {
    this.latched = true;
  }

  sample(out: InputState): void {
    out.moveX += this.moveX;
    out.moveY += this.moveY;
    out.cameraYaw += this.cameraYaw;
    if (this.latched) {
      out.action = true;
      this.latched = false;
    }
  }

  release(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.cameraYaw = 0;
    this.latched = false;
  }

  dispose(): void {
    this.release();
  }
}

/** What the console can read back: where everything is, as plain data. */
export interface DebugHook {
  /** True once the loop is running. */
  readonly ready: boolean;
  hold(moveX: number, moveY: number, cameraYaw?: number): void;
  press(): void;
  teleport(x: number, z: number): void;
  state(): {
    player: Vec3;
    grounded: boolean;
    facingYaw: number;
    focus: string | null;
    carried: string | null;
    /** True while the bell's letters are being sounded. */
    sounding: boolean;
    /** Block id on each stump, left to right, or null for an empty one. */
    stumps: (string | null)[];
    blocks: {
      id: string;
      letter: string;
      position: Vec3;
      carried: boolean;
      pedestalId: string | null;
    }[];
    camera: { position: Vec3; yaw: number; distance: number };
    frames: number;
    audio: string;
  };
}

export function installDebugHook(hook: DebugHook): void {
  (window as unknown as { __pf: DebugHook }).__pf = hook;
}
