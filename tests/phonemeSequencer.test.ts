import { describe, expect, it } from 'vitest';
import { PhonemeSequencer, type ClipBackend, type ClipHandle } from '../src/audio/PhonemeSequencer';

interface FakeClip {
  key: string;
  stopped: boolean;
  onEnded: () => void;
}

/** Nothing ever sounds: a clip ends only when the test says it does. */
class FakeBackend implements ClipBackend {
  readonly played: FakeClip[] = [];
  private readonly known = new Set<string>();

  constructor(known: readonly string[]) {
    this.known = new Set(known.map((key) => key.toLowerCase()));
  }

  has(key: string): boolean {
    return this.known.has(key.toLowerCase());
  }

  play(key: string, onEnded: () => void): ClipHandle {
    const clip: FakeClip = { key, stopped: false, onEnded };
    this.played.push(clip);
    return {
      stop: () => {
        clip.stopped = true;
      },
    };
  }

  /**
   * Fires the callback for clip `index`, even when that clip was stopped, which
   * is what a late backend callback looks like from the sequencer's point of view.
   */
  finish(index: number): void {
    const clip = this.played[index];
    if (clip) clip.onEnded();
  }

  keys(): string[] {
    return this.played.map((clip) => clip.key);
  }
}

function withRecorder(known: readonly string[]) {
  const backend = new FakeBackend(known);
  const sequencer = new PhonemeSequencer(backend);
  const events: string[] = [];
  sequencer.on('letterStarted', (key) => events.push(`started:${key}`));
  sequencer.on('sequenceFinished', () => events.push('finished'));
  sequencer.on('sequenceCancelled', () => events.push('cancelled'));
  return { backend, sequencer, events };
}

describe('PhonemeSequencer', () => {
  it('plays the keys in order and finishes once', () => {
    const { backend, sequencer, events } = withRecorder(['a', 'b', 'c']);

    sequencer.playSequence(['a', 'b', 'c']);
    expect(backend.keys()).toEqual(['a']);
    expect(events).toEqual(['started:a']);

    backend.finish(0);
    expect(backend.keys()).toEqual(['a', 'b']);
    expect(events).toEqual(['started:a', 'started:b']);

    backend.finish(1);
    backend.finish(2);
    expect(backend.keys()).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['started:a', 'started:b', 'started:c', 'finished']);
  });

  it('skips unknown keys', () => {
    const { backend, sequencer, events } = withRecorder(['a']);

    sequencer.playSequence(['a', 'q']);
    expect(backend.keys()).toEqual(['a']);
    expect(events).toEqual(['started:a']);

    backend.finish(0);
    expect(events).toEqual(['started:a', 'finished']);
  });

  it('an all-unknown sequence emits nothing and leaves busy false', () => {
    const { backend, sequencer, events } = withRecorder(['a']);

    sequencer.playSequence(['q', 'z']);
    expect(backend.keys()).toEqual([]);
    expect(events).toEqual([]);
    expect(sequencer.busy).toBe(false);
  });

  it('replacing mid-sequence cancels first and stops the old clip', () => {
    const { backend, sequencer, events } = withRecorder(['a', 'b', 'x']);

    sequencer.playSequence(['a', 'b']);
    sequencer.playSequence(['x']);

    expect(events).toEqual(['started:a', 'cancelled', 'started:x']);
    expect(backend.played[0].stopped).toBe(true);
    expect(backend.keys()).toEqual(['a', 'x']);
    expect(sequencer.busy).toBe(true);

    backend.finish(1);
    expect(events).toEqual(['started:a', 'cancelled', 'started:x', 'finished']);
  });

  it('stop() when idle emits nothing', () => {
    const { backend, sequencer, events } = withRecorder(['a']);

    sequencer.stop();
    expect(events).toEqual([]);
    expect(backend.keys()).toEqual([]);
    expect(sequencer.busy).toBe(false);
  });

  it('a late onEnded from a stopped clip is ignored', () => {
    const { backend, sequencer, events } = withRecorder(['a', 'b']);

    sequencer.playSequence(['a', 'b']);
    sequencer.stop();
    backend.finish(0); // the backend calls back after the clip was stopped

    expect(events).toEqual(['started:a', 'cancelled']);
    expect(backend.keys()).toEqual(['a']);
    expect(sequencer.busy).toBe(false);
  });

  it('a late onEnded from a replaced clip does not advance the new sequence', () => {
    const { backend, sequencer, events } = withRecorder(['a', 'b', 'x']);

    sequencer.playSequence(['a', 'b']);
    backend.finish(0); // 'a' ends normally, 'b' starts
    sequencer.playSequence(['x']);
    backend.finish(1); // 'b' was stopped: its late callback must be ignored

    expect(events).toEqual(['started:a', 'started:b', 'cancelled', 'started:x']);
    backend.finish(2);
    expect(events).toEqual(['started:a', 'started:b', 'cancelled', 'started:x', 'finished']);
  });

  it('accepts uppercase keys', () => {
    const { backend, sequencer, events } = withRecorder(['a', 'b']);

    sequencer.playSequence(['A', 'B']);
    expect(backend.keys()).toEqual(['a']);
    expect(events).toEqual(['started:a']);

    backend.finish(0);
    backend.finish(1);
    expect(backend.keys()).toEqual(['a', 'b']);
    expect(events).toEqual(['started:a', 'started:b', 'finished']);
  });

  it('playSequence from a sequenceFinished listener works', () => {
    const backend = new FakeBackend(['a', 'b']);
    const sequencer = new PhonemeSequencer(backend);
    const events: string[] = [];
    let rerun = false;

    sequencer.on('sequenceFinished', () => {
      events.push(`finished(busy=${sequencer.busy})`);
      if (!rerun) {
        rerun = true;
        sequencer.playSequence(['b']);
      }
    });
    sequencer.on('letterStarted', (key) => events.push(`started:${key}`));

    sequencer.playSequence(['a']);
    backend.finish(0);
    expect(events).toEqual(['started:a', 'finished(busy=false)', 'started:b']);
    expect(sequencer.busy).toBe(true);

    backend.finish(1);
    expect(events).toEqual(['started:a', 'finished(busy=false)', 'started:b', 'finished(busy=false)']);
    expect(sequencer.busy).toBe(false);
  });

  it('playSequence from a letterStarted listener does not double-play', () => {
    const backend = new FakeBackend(['a', 'b']);
    const sequencer = new PhonemeSequencer(backend);
    const events: string[] = [];
    let rerun = false;

    sequencer.on('letterStarted', (key) => {
      events.push(`started:${key}`);
      if (!rerun) {
        rerun = true;
        sequencer.playSequence(['b']);
      }
    });
    sequencer.on('sequenceCancelled', () => events.push('cancelled'));
    sequencer.on('sequenceFinished', () => events.push('finished'));

    sequencer.playSequence(['a']);
    expect(backend.keys()).toEqual(['a', 'b']);
    expect(backend.played[0].stopped).toBe(true);
    expect(events).toEqual(['started:a', 'cancelled', 'started:b']);

    backend.finish(1);
    expect(events).toEqual(['started:a', 'cancelled', 'started:b', 'finished']);
  });

  it('a listener that re-triggers playSequence on every event is bounded', () => {
    const backend = new FakeBackend(['a']);
    const sequencer = new PhonemeSequencer(backend);

    sequencer.on('letterStarted', () => sequencer.playSequence(['a']));

    // The fake backend never ends a clip on its own, so the listener runs once
    // per playSequence and the re-entrancy cap stops the chain.
    sequencer.playSequence(['a']);
    expect(backend.keys().length).toBeLessThanOrEqual(8);
    expect(backend.keys().length).toBeGreaterThan(1);
  });

  it('busy is false before, true during, and false after', () => {
    const { backend, sequencer } = withRecorder(['a', 'b']);
    const seen: boolean[] = [sequencer.busy];

    sequencer.on('letterStarted', () => seen.push(sequencer.busy));
    sequencer.on('sequenceFinished', () => seen.push(sequencer.busy));

    sequencer.playSequence(['a', 'b']);
    seen.push(sequencer.busy);
    backend.finish(0);
    backend.finish(1);

    expect(seen).toEqual([false, true, true, true, false]);
  });
});
