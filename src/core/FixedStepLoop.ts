import type { FixedStepOptions } from './contracts';

/** Injected raf pair: the loop must be drivable from Node tests with no browser. */
export interface RafDeps {
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
}

export class FixedStepLoop {
  readonly step: number;
  private readonly maxSubSteps: number;
  private readonly simulate: (dt: number) => void;
  private readonly render: (alpha: number, frameDt: number) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly caf: (id: number) => void;

  private accumulator = 0;
  /** null until the first tick, which only records a baseline time. */
  private lastMs: number | null = null;
  private rafId: number | null = null;
  private started = false;

  constructor(options: FixedStepOptions, deps: RafDeps = {}) {
    const step = options.step ?? 1 / 60;
    const maxSubSteps = options.maxSubSteps ?? 5;
    if (!Number.isFinite(step) || step <= 0) {
      throw new RangeError(`step must be finite and > 0, got ${step}`);
    }
    if (!Number.isInteger(maxSubSteps) || maxSubSteps < 1) {
      throw new RangeError(`maxSubSteps must be an integer >= 1, got ${maxSubSteps}`);
    }
    this.step = step;
    this.maxSubSteps = maxSubSteps;
    this.simulate = options.simulate;
    this.render = options.render;
    this.onError = options.onError;
    this.raf = deps.raf ?? globalThis.requestAnimationFrame;
    this.caf = deps.caf ?? globalThis.cancelAnimationFrame;
  }

  get running(): boolean {
    return this.started;
  }

  /** @param nowMs timestamp in milliseconds, as requestAnimationFrame passes it. */
  tick(nowMs: number): void {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      this.callRender(0, 0);
      return;
    }

    let elapsedMs = nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
    const frameDt = elapsedMs / 1000;
    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      this.callSimulate();
      this.accumulator -= this.step;
      steps += 1;
    }
    // Surplus whole steps are dropped rather than carried: a frame that cannot
    // be simulated in full must not keep owing time, or the game spirals.
    if (steps >= this.maxSubSteps && this.accumulator >= this.step) {
      this.accumulator %= this.step;
    }

    this.callRender(this.accumulator / this.step, frameDt);
  }

  start(): void {
    if (this.started) return;
    if (typeof this.raf !== 'function') {
      throw new Error('FixedStepLoop has no requestAnimationFrame; inject raf for tests');
    }
    this.started = true;
    // A restart must not catch up on the gap created while it was stopped.
    this.lastMs = null;
    this.rafId = this.raf(this.frame);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.rafId !== null && typeof this.caf === 'function') this.caf(this.rafId);
    this.rafId = null;
  }

  private frame = (nowMs: number): void => {
    this.rafId = null;
    this.tick(nowMs);
    if (this.started) this.rafId = this.raf(this.frame);
  };

  private callSimulate(): void {
    try {
      this.simulate(this.step);
    } catch (error) {
      this.report(error);
    }
  }

  private callRender(alpha: number, frameDt: number): void {
    try {
      this.render(alpha, frameDt);
    } catch (error) {
      this.report(error);
    }
  }

  private report(error: unknown): void {
    if (!this.onError) return;
    try {
      this.onError(error);
    } catch {
      // onError itself threw; the loop still must survive the frame.
    }
  }
}
