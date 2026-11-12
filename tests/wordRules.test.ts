import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/core/Emitter';
import type { BlockState, PedestalState, SoundEvents, SoundPlayer, WordEvents } from '../src/core/contracts';
import { WordRules } from '../src/game/WordRules';
import { CVC_WORDS, isWord } from '../src/game/words';

/** Fake sound player: nothing is timed, events are fired by hand. */
class FakeSound implements SoundPlayer {
  readonly played: string[][] = [];
  private readonly emitter = new Emitter<SoundEvents>();
  /** When set, playSequence fires these synchronously during the call. */
  duringPlay: Array<'cancelled' | 'letterStarted'> = [];
  busy = false;

  playSequence(keys: readonly string[]): void {
    this.played.push([...keys]);
    for (const event of this.duringPlay) {
      if (event === 'cancelled') this.emitter.emit('sequenceCancelled');
      else this.emitter.emit('letterStarted', keys[0]);
    }
  }

  stop(): void {}

  on<K extends keyof SoundEvents>(event: K, listener: (payload: SoundEvents[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  letterStarted(key: string): void {
    this.emitter.emit('letterStarted', key);
  }

  sequenceFinished(): void {
    this.emitter.emit('sequenceFinished');
  }

  sequenceCancelled(): void {
    this.emitter.emit('sequenceCancelled');
  }
}

interface Recorded {
  event: keyof WordEvents;
  payload: unknown;
}

function makeBlock(id: string, letter: string): BlockState {
  return { id, letter, position: { x: 0, y: 0, z: 0 }, carried: false, pedestalId: null, silentDrops: false };
}

function makePedestal(id: string, blockId: string | null): PedestalState {
  return { id, position: { x: 0, y: 0, z: 0 }, snapHeight: 0.5, blockId };
}

function record(rules: WordRules): Recorded[] {
  const events: Recorded[] = [];
  const add = (event: keyof WordEvents) => (payload: unknown): void => {
    events.push({ event, payload });
  };
  rules.on('nothingToSound', add('nothingToSound'));
  rules.on('letterSounded', add('letterSounded'));
  rules.on('wordMade', add('wordMade'));
  rules.on('notYet', add('notYet'));
  return events;
}

function names(events: Recorded[]): string[] {
  return events.map((event) => event.event);
}

describe('WordRules', () => {
  it('reports nothing to sound when the row is empty', () => {
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals: [makePedestal('p1', null)], blocks: [], sound });
    const events = record(rules);

    rules.ring();
    expect(names(events)).toEqual(['nothingToSound']);
    expect(sound.played).toEqual([]);
    expect(rules.sounding).toBe(false);
  });

  it('plays the letters of the filled pedestals in order', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const pedestals = [makePedestal('p1', 'b1'), makePedestal('p2', 'b2'), makePedestal('p3', 'b3')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    expect(sound.played).toEqual([['s', 'a', 't']]);
    expect(rules.sounding).toBe(true);

    for (const key of ['s', 'a', 't']) sound.letterStarted(key);
    expect(names(events)).toEqual(['letterSounded', 'letterSounded', 'letterSounded']);
    expect(events.map((event) => event.payload)).toEqual([
      { index: 0, pedestalId: 'p1', blockId: 'b1', letter: 's' },
      { index: 1, pedestalId: 'p2', blockId: 'b2', letter: 'a' },
      { index: 2, pedestalId: 'p3', blockId: 'b3', letter: 't' },
    ]);

    sound.sequenceFinished();
    expect(events[3].event).toBe('wordMade');
    expect(events[3].payload).toEqual({ word: 'sat', blockIds: ['b1', 'b2', 'b3'] });
    expect(rules.sounding).toBe(false);
  });

  it('letters that are not a word end with notYet', () => {
    const blocks = [makeBlock('b1', 't'), makeBlock('b2', 's'), makeBlock('b3', 'a')];
    const pedestals = [makePedestal('p1', 'b1'), makePedestal('p2', 'b2'), makePedestal('p3', 'b3')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    sound.sequenceFinished();
    expect(events).toEqual([{ event: 'notYet', payload: { letters: 'tsa' } }]);
  });

  it('a two-letter prefix is never a word', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a')];
    const pedestals = [makePedestal('p1', 'b1'), makePedestal('p2', 'b2'), makePedestal('p3', null)];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    expect(sound.played).toEqual([['s', 'a']]);
    sound.letterStarted('s');
    sound.letterStarted('a');
    sound.sequenceFinished();
    expect(names(events)).toEqual(['letterSounded', 'letterSounded', 'notYet']);
    expect(events[2].payload).toEqual({ letters: 'sa' });
  });

  it('skips an empty pedestal but keeps its id', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b3', 't')];
    const pedestals = [makePedestal('p1', 'b1'), makePedestal('p2', null), makePedestal('p3', 'b3')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    expect(sound.played).toEqual([['s', 't']]);
    sound.letterStarted('s');
    sound.letterStarted('t');
    expect(events.map((event) => event.payload)).toEqual([
      { index: 0, pedestalId: 'p1', blockId: 'b1', letter: 's' },
      { index: 1, pedestalId: 'p3', blockId: 'b3', letter: 't' },
    ]);
    sound.sequenceFinished();
    expect(names(events)).toEqual(['letterSounded', 'letterSounded', 'notYet']);
  });

  it('ringing twice plays once', () => {
    const blocks = [makeBlock('b1', 's')];
    const pedestals = [makePedestal('p1', 'b1')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });

    rules.ring();
    rules.ring();
    expect(sound.played).toEqual([['s']]);
  });

  it('a cancelled sequence reports nothing and a later ring works', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const pedestals = [makePedestal('p1', 'b1'), makePedestal('p2', 'b2'), makePedestal('p3', 'b3')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    sound.letterStarted('s');
    sound.sequenceCancelled();
    expect(names(events)).toEqual(['letterSounded']);
    expect(rules.sounding).toBe(false);

    sound.sequenceFinished();
    expect(names(events)).toEqual(['letterSounded']);

    rules.ring();
    expect(sound.played).toEqual([['s', 'a', 't'], ['s', 'a', 't']]);
  });

  it('ignores letters when nothing was rung', () => {
    const blocks = [makeBlock('b1', 's')];
    const pedestals = [makePedestal('p1', 'b1')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    sound.letterStarted('s');
    expect(events).toEqual([]);
  });

  it('accepts a letter fired synchronously during playSequence', () => {
    const blocks = [makeBlock('b1', 's')];
    const pedestals = [makePedestal('p1', 'b1')];
    const sound = new FakeSound();
    sound.duringPlay = ['cancelled', 'letterStarted'];
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    expect(names(events)).toEqual(['letterSounded']);
    expect(events[0].payload).toEqual({ index: 0, pedestalId: 'p1', blockId: 'b1', letter: 's' });
    expect(rules.sounding).toBe(true);
  });

  it('extra letters past the end of the list are ignored', () => {
    const blocks = [makeBlock('b1', 's')];
    const pedestals = [makePedestal('p1', 'b1')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    sound.letterStarted('s');
    sound.letterStarted('a');
    expect(names(events)).toEqual(['letterSounded']);
  });

  it('dispose stops listening to the sound player', () => {
    const blocks = [makeBlock('b1', 's')];
    const pedestals = [makePedestal('p1', 'b1')];
    const sound = new FakeSound();
    const rules = new WordRules({ pedestals, blocks, sound });
    const events = record(rules);

    rules.ring();
    rules.dispose();
    sound.letterStarted('s');
    expect(events).toEqual([]);
  });

  it('words are matched case-insensitively and are three lowercase letters', () => {
    expect(isWord('SAT')).toBe(true);
    expect(CVC_WORDS.size).toBeGreaterThanOrEqual(200);
    for (const word of CVC_WORDS) expect(word).toMatch(/^[a-z]{3}$/);
  });
});
