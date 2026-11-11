import type { InputSource, InputState } from '../core/contracts';

/**
 * The on-screen action button (UI code lives elsewhere) and anything else that
 * wants to press the action. A press shorter than one simulation step is not
 * lost: it is latched until the next sample.
 */
export class ButtonSource implements InputSource {
  private latched = false;

  press(): void {
    this.latched = true;
  }

  sample(out: InputState): void {
    if (!this.latched) return;
    out.action = true;
    this.latched = false;
  }

  release(): void {
    this.latched = false;
  }

  dispose(): void {
    this.release();
  }
}
