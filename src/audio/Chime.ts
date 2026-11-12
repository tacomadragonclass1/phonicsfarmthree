/** The oscillator members Chime calls, so a fake can stand in for tests. */
export interface OscLike {
  frequency: { value: number };
  connect(destination: unknown): void;
  start(time: number): void;
  stop(time: number): void;
}

/** The gain members Chime calls. */
export interface GainLike {
  gain: {
    setValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
  };
  connect(destination: unknown): void;
}

/** The few AudioContext members used, so a fake can stand in for tests. */
export interface ChimeContext {
  currentTime: number;
  createOscillator(): OscLike;
  createGain(): GainLike;
}

export interface ChimeOptions {
  frequency?: number;
  duration?: number;
  volume?: number;
}

const DEFAULT_FREQUENCY = 660;
const DEFAULT_DURATION = 1.6;
const DEFAULT_VOLUME = 0.25;

/**
 * The partials a struck bell actually rings with. `decay` is the fraction of
 * the duration each partial sounds for: the high ones die away first.
 */
const PARTIALS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2.76, gain: 0.45, decay: 0.6 },
  { ratio: 5.4, gain: 0.2, decay: 0.35 },
] as const;

/** One struck bell: three sine partials, each fading on its own gain node. */
export function playChime(
  context: ChimeContext,
  destination: unknown,
  options: ChimeOptions = {},
): void {
  const frequency = options.frequency ?? DEFAULT_FREQUENCY;
  const duration = options.duration ?? DEFAULT_DURATION;
  const volume = options.volume ?? DEFAULT_VOLUME;
  const now = context.currentTime;

  for (const partial of PARTIALS) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = frequency * partial.ratio;
    gain.gain.setValueAtTime(partial.gain * volume, now);
    // exponentialRamp cannot reach 0, so the fade ends just above silence.
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration * partial.decay);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
