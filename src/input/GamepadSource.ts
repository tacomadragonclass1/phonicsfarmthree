import type { InputSource, InputState } from '../core/contracts';

export interface GamepadButtonLike {
  pressed: boolean;
}

export interface GamepadLike {
  mapping: string;
  connected: boolean;
  axes: ArrayLike<number>;
  buttons: ArrayLike<GamepadButtonLike>;
}

export type GamepadReader = () => ArrayLike<GamepadLike | null>;

/** Standard mapping: axes 0/1 left stick, 2/3 right stick. */
const LEFT_DEADZONE = 0.2;
const RIGHT_DEADZONE = 0.25;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
/** Xbox layout: A (0) jumps, B (1) picks up and puts down. */
const JUMP_BUTTON = 0;
const ACTION_BUTTON = 1;

/** Rescaled so the edge of the deadzone reads 0 and full deflection reads 1. */
function rescale(value: number, deadzone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

/** Polls on sample: the Gamepad API has no events for sticks. */
export class GamepadSource implements InputSource {
  private readonly getGamepads: GamepadReader;

  /** Pad seen on the previous sample; null means "no baseline yet". */
  private pad: GamepadLike | null = null;
  private actionWasPressed = false;
  private jumpWasPressed = false;

  constructor(getGamepads: GamepadReader) {
    this.getGamepads = getGamepads;
  }

  private pickPad(): GamepadLike | null {
    const pads = this.getGamepads();
    let first: GamepadLike | null = null;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') return pad;
      if (!first) first = pad;
    }
    return first;
  }

  private pressed(pad: GamepadLike, index: number): boolean {
    return Boolean(pad.buttons[index]?.pressed);
  }

  sample(out: InputState): void {
    const pad = this.pickPad();
    if (!pad) {
      // Unplugged: nothing to report, and the baseline is forgotten so a
      // re-plug with the button already held cannot fire an action.
      this.pad = null;
      this.actionWasPressed = false;
      this.jumpWasPressed = false;
      return;
    }

    // First sample after a pad appears only establishes the edge baseline.
    const isNewPad = this.pad !== pad;
    this.pad = pad;

    const isPressed = this.pressed(pad, ACTION_BUTTON);
    if (isNewPad) this.actionWasPressed = isPressed;
    else if (isPressed && !this.actionWasPressed) out.action = true;
    this.actionWasPressed = isPressed;

    const jumpPressed = this.pressed(pad, JUMP_BUTTON);
    if (isNewPad) this.jumpWasPressed = jumpPressed;
    else if (jumpPressed && !this.jumpWasPressed) out.jump = true;
    this.jumpWasPressed = jumpPressed;

    const dpadX = (this.pressed(pad, DPAD.right) ? 1 : 0) - (this.pressed(pad, DPAD.left) ? 1 : 0);
    const dpadY = (this.pressed(pad, DPAD.down) ? 1 : 0) - (this.pressed(pad, DPAD.up) ? 1 : 0);
    if (dpadX !== 0 || dpadY !== 0) {
      out.moveX += dpadX;
      out.moveY += dpadY;
    } else {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const length = Math.hypot(x, y);
      if (length > LEFT_DEADZONE) {
        // Radial: the whole vector is scaled by how far past the deadzone it is.
        const scale = (length - LEFT_DEADZONE) / ((1 - LEFT_DEADZONE) * length);
        out.moveX += x * scale;
        out.moveY += y * scale;
      }
    }

    out.cameraYaw += rescale(pad.axes[2] ?? 0, RIGHT_DEADZONE);
  }

  release(): void {
    this.pad = null;
    this.actionWasPressed = false;
    this.jumpWasPressed = false;
  }

  dispose(): void {
    this.release();
  }
}
