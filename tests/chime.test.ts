import { describe, expect, it } from 'vitest';
import { playChime, type ChimeContext, type GainLike, type OscLike } from '../src/audio/Chime';

class FakeOsc implements OscLike {
  readonly frequency = { value: 0 };
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  connectedTo: unknown = null;

  connect(destination: unknown): void {
    this.connectedTo = destination;
  }

  start(time: number): void {
    this.starts.push(time);
  }

  stop(time: number): void {
    this.stops.push(time);
  }
}

class FakeGain implements GainLike {
  readonly set: Array<{ value: number; time: number }> = [];
  readonly ramps: Array<{ value: number; time: number }> = [];
  connectedTo: unknown = null;

  readonly gain = {
    setValueAtTime: (value: number, time: number): void => {
      this.set.push({ value, time });
    },
    exponentialRampToValueAtTime: (value: number, time: number): void => {
      this.ramps.push({ value, time });
    },
  };

  connect(destination: unknown): void {
    this.connectedTo = destination;
  }
}

class FakeContext implements ChimeContext {
  readonly oscs: FakeOsc[] = [];
  readonly gains: FakeGain[] = [];

  constructor(readonly currentTime: number) {}

  createOscillator(): OscLike {
    const osc = new FakeOsc();
    this.oscs.push(osc);
    return osc;
  }

  createGain(): GainLike {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

const RATIOS = [1, 2.76, 5.4];
const GAINS = [1, 0.45, 0.2];
const DECAYS = [1, 0.6, 0.35];

describe('playChime', () => {
  it('creates three partials at the bell ratios with the right gains', () => {
    const context = new FakeContext(2);
    const destination = { name: 'master' };
    playChime(context, destination);

    expect(context.oscs.length).toBe(3);
    expect(context.gains.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      const osc = context.oscs[i];
      const gain = context.gains[i];
      expect(osc.frequency.value).toBeCloseTo(660 * RATIOS[i], 6);

      // Each partial runs through its own gain node, which reaches the master.
      expect(osc.connectedTo).toBe(gain);
      expect(gain.connectedTo).toBe(destination);

      expect(gain.set).toEqual([{ value: GAINS[i] * 0.25, time: 2 }]);
      expect(gain.ramps).toEqual([{ value: 0.0001, time: 2 + 1.6 * DECAYS[i] }]);

      expect(osc.starts).toEqual([2]);
      expect(osc.stops).toEqual([2 + 1.6]);
    }
  });

  it('options set frequency, duration and volume', () => {
    const context = new FakeContext(1);
    playChime(context, null, { frequency: 880, duration: 2, volume: 0.5 });

    for (let i = 0; i < 3; i++) {
      expect(context.oscs[i].frequency.value).toBeCloseTo(880 * RATIOS[i], 6);
      expect(context.gains[i].set[0].value).toBeCloseTo(GAINS[i] * 0.5, 6);
      expect(context.gains[i].ramps[0].time).toBeCloseTo(1 + 2 * DECAYS[i], 6);
      expect(context.oscs[i].stops[0]).toBe(3);
    }
  });
});
