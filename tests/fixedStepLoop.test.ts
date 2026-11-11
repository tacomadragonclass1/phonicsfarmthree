import { describe, expect, it } from 'vitest';
import type { FixedStepOptions } from '../src/core/contracts';
import { FixedStepLoop } from '../src/core/FixedStepLoop';

const STEP = 1 / 60;

interface Recorder {
  simulates: number[];
  renders: Array<[number, number]>;
  errors: unknown[];
  options: FixedStepOptions;
}

function recorder(overrides: Partial<FixedStepOptions> = {}): Recorder {
  const simulates: number[] = [];
  const renders: Array<[number, number]> = [];
  const errors: unknown[] = [];
  return {
    simulates,
    renders,
    errors,
    options: {
      simulate: (dt) => { simulates.push(dt); },
      render: (alpha, frameDt) => { renders.push([alpha, frameDt]); },
      onError: (error) => { errors.push(error); },
      ...overrides,
    },
  };
}

/** raf pair that only runs when the test drives it, so no timers are involved. */
function fakeRaf() {
  const pending = new Map<number, (t: number) => void>();
  const cancelled: number[] = [];
  let nextId = 1;
  return {
    pending,
    cancelled,
    raf: (cb: (t: number) => void): number => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    caf: (id: number): void => {
      pending.delete(id);
      cancelled.push(id);
    },
    run: (id: number, t: number): void => {
      const cb = pending.get(id);
      if (!cb) throw new Error(`no pending callback for id ${id}`);
      pending.delete(id);
      cb(t);
    },
    onlyPendingId: (): number => {
      if (pending.size !== 1) throw new Error(`expected 1 pending callback, got ${pending.size}`);
      return [...pending.keys()][0];
    },
  };
}

describe('FixedStepLoop', () => {
  it('first tick records time only but still renders once', () => {
    const rec = recorder();
    const loop = new FixedStepLoop(rec.options);
    loop.tick(1000);
    expect(rec.simulates).toHaveLength(0);
    expect(rec.renders).toEqual([[0, 0]]);
  });

  it('runs one 1/60 step per whole step: 6 for a 100 ms frame', () => {
    const rec = recorder({ maxSubSteps: 10 }); // above the default 5, so nothing is clamped
    const loop = new FixedStepLoop(rec.options);
    loop.tick(0);
    loop.tick(100);
    expect(rec.simulates).toHaveLength(6);
    expect(rec.simulates.every((dt) => dt === STEP)).toBe(true);
    expect(rec.renders).toHaveLength(2);
    expect(rec.renders[1][0]).toBeCloseTo(0, 10);
    expect(rec.renders[1][1]).toBeCloseTo(0.1, 10);
  });

  it('default maxSubSteps is 5, so a 100 ms frame runs 5 steps and drops the rest', () => {
    const rec = recorder();
    const loop = new FixedStepLoop(rec.options);
    loop.tick(0);
    loop.tick(100);
    expect(rec.simulates).toHaveLength(5);
    expect(rec.renders[1][0]).toBeCloseTo(0, 10); // surplus dropped, not carried
  });

  it('clamps to maxSubSteps and drops the surplus instead of owing it', () => {
    const rec = recorder({ maxSubSteps: 3 });
    const loop = new FixedStepLoop(rec.options);
    loop.tick(0);
    loop.tick(105); // 6 steps owed, only 3 run; 0.005 s of sub-step time remains
    expect(rec.simulates).toHaveLength(3);
    expect(rec.renders[1][0]).toBeCloseTo(0.3, 6);
    expect(rec.renders[1][1]).toBeCloseTo(0.105, 6);

    // A zero-length frame must not resurrect the dropped steps.
    loop.tick(105);
    expect(rec.simulates).toHaveLength(3);
    expect(rec.renders[2][0]).toBeCloseTo(0.3, 6);
    expect(rec.renders[2][1]).toBeCloseTo(0, 10);
  });

  it('alpha stays in [0, 1) across many frames', () => {
    const rec = recorder({ maxSubSteps: 5 });
    const loop = new FixedStepLoop(rec.options);
    let now = 0;
    loop.tick(now);
    for (const ms of [16, 33, 50, 100, 250, 1000, 5000, 8, 16.6667]) {
      now += ms;
      loop.tick(now);
    }
    for (const [alpha] of rec.renders) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('a negative or non-finite elapsed time counts as 0', () => {
    const rec = recorder();
    const loop = new FixedStepLoop(rec.options);
    loop.tick(1000);
    loop.tick(900); // clock went backwards
    expect(rec.simulates).toHaveLength(0);
    expect(rec.renders[1]).toEqual([0, 0]);
    loop.tick(Number.NaN);
    expect(rec.simulates).toHaveLength(0);
    expect(rec.renders[2]).toEqual([0, 0]);
  });

  it('reports an error thrown by simulate and keeps ticking', () => {
    const boom = new Error('simulate blew up');
    let thrown = false;
    const rec = recorder({ maxSubSteps: 10,
      simulate: (dt) => {
        if (!thrown) {
          thrown = true;
          throw boom;
        }
        rec.simulates.push(dt);
      },
    });
    const loop = new FixedStepLoop(rec.options);
    loop.tick(0);
    expect(() => loop.tick(100)).not.toThrow();
    expect(rec.errors).toEqual([boom]);
    // render still ran once for the failed frame, and the next frame works.
    expect(rec.renders).toHaveLength(2);
    expect(rec.simulates).toHaveLength(5); // the first of the 6 steps threw
    loop.tick(200);
    expect(rec.simulates).toHaveLength(11);
    expect(rec.errors).toHaveLength(1);
  });

  it('reports an error thrown by render, and swallows it without onError', () => {
    const rec = recorder({ render: () => { throw new Error('render blew up'); } });
    const loop = new FixedStepLoop(rec.options);
    expect(() => loop.tick(0)).not.toThrow();
    expect(rec.errors).toHaveLength(1);

    const silent = recorder({ render: () => { throw new Error('no listener'); } });
    silent.options.onError = undefined;
    const quiet = new FixedStepLoop(silent.options);
    expect(() => quiet.tick(0)).not.toThrow();
    expect(() => quiet.tick(100)).not.toThrow();
    expect(silent.simulates).toHaveLength(5); // default maxSubSteps
  });

  it('start/stop drive tick through the injected raf', () => {
    const rec = recorder({ maxSubSteps: 10 });
    const fake = fakeRaf();
    const loop = new FixedStepLoop(rec.options, { raf: fake.raf, caf: fake.caf });

    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    const id = fake.onlyPendingId();
    fake.run(id, 0);
    expect(rec.renders).toEqual([[0, 0]]);

    fake.run(fake.onlyPendingId(), 100);
    expect(rec.simulates).toHaveLength(6);

    // start twice must not create a second loop.
    loop.start();
    expect(fake.pending.size).toBe(1);

    loop.stop();
    expect(loop.running).toBe(false);
    expect(fake.pending.size).toBe(0);
    expect(fake.cancelled).toHaveLength(1);

    // Restart must not catch up on the stopped gap.
    loop.start();
    fake.run(fake.onlyPendingId(), 9000);
    expect(rec.simulates).toHaveLength(6); // still only the 6 from the earlier frame
    expect(rec.renders).toHaveLength(3);
    expect(rec.renders[2]).toEqual([0, 0]);
    loop.stop();
    loop.stop(); // stopping twice is a no-op
    expect(loop.running).toBe(false);
  });

  it('validates step and maxSubSteps', () => {
    const base = recorder().options;
    for (const step of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => new FixedStepLoop({ ...base, step })).toThrow(RangeError);
    }
    for (const maxSubSteps of [0, -1, 2.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => new FixedStepLoop({ ...base, maxSubSteps })).toThrow(RangeError);
    }
    const ok = new FixedStepLoop(base);
    expect(ok.step).toBeCloseTo(1 / 60, 12);
    expect(new FixedStepLoop({ ...base, step: 0.02 }).step).toBe(0.02);
  });
});
