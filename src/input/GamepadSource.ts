import type { InputSource, InputState } from '../core/contracts';

export interface GamepadButtonLike {
  pressed: boolean;
}

export interface GamepadLike {
  /** Slot number; with `id` it says which physical pad this is. */
  index?: number;
  id?: string;
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
/**
 * Xbox layout. A (0) jumps; B (1) or the right trigger (7) picks up, puts down and
 * uses things. The right stick swings and tilts the camera, the bumpers zoom
 * (LB 4 out, RB 5 in) and pressing the right stick (11) puts the camera back.
 */
const JUMP_BUTTON = 0;
const ACTION_BUTTONS = [1, 7];
const ZOOM_OUT_BUTTON = 4;
const ZOOM_IN_BUTTON = 5;
const CAMERA_RESET_BUTTON = 11;

/** Rescaled so the edge of the deadzone reads 0 and full deflection reads 1. */
function rescale(value: number, deadzone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

/** Polls on sample: the Gamepad API has no events for sticks. */
export class GamepadSource implements InputSource {
  private readonly getGamepads: GamepadReader;

  /**
   * Which pad the previous sample read; null means "no baseline yet". Kept as a key,
   * not the object: Chrome hands back a fresh snapshot object on every poll, so comparing
   * objects made every sample look like a newly plugged pad and no press ever fired.
   */
  private padKey: string | null = null;
  private actionWasPressed = false;
  private jumpWasPressed = false;
  private resetWasPressed = false;

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
      this.padKey = null;
      this.actionWasPressed = false;
      this.jumpWasPressed = false;
      this.resetWasPressed = false;
      return;
    }

    // First sample after a pad appears only establishes the edge baseline.
    const key = `${pad.index ?? 0}|${pad.id ?? ''}`;
    const isNewPad = this.padKey !== key;
    this.padKey = key;

    const isPressed = ACTION_BUTTONS.some((index) => this.pressed(pad, index));
    if (isNewPad) this.actionWasPressed = isPressed;
    else if (isPressed && !this.actionWasPressed) out.action = true;
    this.actionWasPressed = isPressed;

    const jumpPressed = this.pressed(pad, JUMP_BUTTON);
    if (isNewPad) this.jumpWasPressed = jumpPressed;
    else if (jumpPressed && !this.jumpWasPressed) out.jump = true;
    this.jumpWasPressed = jumpPressed;

    const resetPressed = this.pressed(pad, CAMERA_RESET_BUTTON);
    if (isNewPad) this.resetWasPressed = resetPressed;
    else if (resetPressed && !this.resetWasPressed) out.cameraReset = true;
    this.resetWasPressed = resetPressed;

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
    // Stick up reads negative, and up lifts the camera.
    out.cameraPitch -= rescale(pad.axes[3] ?? 0, RIGHT_DEADZONE);
    out.cameraZoom += (this.pressed(pad, ZOOM_IN_BUTTON) ? 1 : 0) - (this.pressed(pad, ZOOM_OUT_BUTTON) ? 1 : 0);
  }

  release(): void {
    this.padKey = null;
    this.actionWasPressed = false;
    this.jumpWasPressed = false;
    this.resetWasPressed = false;
  }

  dispose(): void {
    this.release();
  }
}
