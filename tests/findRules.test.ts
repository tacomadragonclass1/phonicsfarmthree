import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/core/Emitter';
import type { BlockState, FindEvents, SoundEvents, SoundPlayer } from '../src/core/contracts';
import { FindRules } from '../src/game/FindRules';

/** Fake sound player: nothing is timed, events are fired by hand. */
class FakeSound implements SoundPlayer {
  readonly played: string[][] = [];
  readonly busy = false;
  private readonly emitter = new Emitter<SoundEvents>();

  playSequence(keys: readonly string[]): void {
    this.played.push([...keys]);
  }

  stop(): void {}

  on<K extends keyof SoundEvents>(event: K, listener: (payload: SoundEvents[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }
}

interface Recorded {
  event: keyof FindEvents;
  payload: unknown;
}

function makeBlock(id: string, letter: string): BlockState {
  return { id, letter, position: { x: 0, y: 0, z: 0 }, carried: false, pedestalId: null, silentDrops: false };
}

/** Rules with their events and played keys recorded. `random` defaults to 0. */
function setup(blocks: BlockState[], carried: () => BlockState | null, random: () => number = () => 0) {
  const sound = new FakeSound();
  const rules = new FindRules({ blocks, sound, carried, random });
  const events: Recorded[] = [];
  for (const event of ['asked', 'found', 'tryAgain', 'complete'] as const) {
    rules.on(event, (payload) => events.push({ event, payload }));
  }
  return { rules, sound, events };
}

function names(events: Recorded[]): string[] {
  return events.map((event) => event.event);
}

describe('FindRules', () => {
  it('the first talk asks for a letter', () => {
    const { rules, sound, events } = setup([makeBlock('b1', 's')], () => null);

    rules.talk();
    expect(names(events)).toEqual(['asked']);
    expect(events[0].payload).toEqual({ letter: 's' });
    expect(rules.wanted).toBe('s');
    expect(sound.played).toEqual([['annette_find', 's']]);
  });

  it('begin asks without being talked to', () => {
    const { rules, sound, events } = setup([makeBlock('b1', 's'), makeBlock('b2', 'a')], () => null);

    rules.begin();
    expect(rules.wanted).toBe('a');
    expect(names(events)).toEqual(['asked']);
    expect(sound.played).toEqual([['annette_find', 'a']]);

    // A second begin does nothing while something is already wanted.
    rules.begin();
    expect(names(events)).toEqual(['asked']);
    expect(sound.played.length).toBe(1);
  });

  it('the first letter is the lowest of the sorted distinct letters', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const { rules, sound } = setup(blocks, () => null);

    rules.talk();
    expect(rules.wanted).toBe('a');
    expect(sound.played).toEqual([['annette_find', 'a']]);
  });

  it('repeats the request when the hands are empty', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const { rules, sound, events } = setup(blocks, () => null);

    rules.talk();
    rules.talk();
    expect(rules.wanted).toBe('a');
    expect(names(events)).toEqual(['asked', 'asked']);
    expect(events[1].payload).toEqual({ letter: 'a' });
    expect(sound.played).toEqual([['annette_find', 'a'], ['annette_find', 'a']]);
  });

  it('found is silent: the game removes the block and next() praises and asks', () => {
    const wanted = makeBlock('b2', 'a');
    const blocks = [makeBlock('b1', 's'), wanted, makeBlock('b3', 't')];
    let carried: BlockState | null = null;
    const { rules, sound, events } = setup(blocks, () => carried);

    rules.talk(); // asks for 'a'
    carried = wanted;
    rules.talk();
    expect(names(events)).toEqual(['asked', 'found']);
    expect(events[1].payload).toEqual({ letter: 'a', blockId: 'b2' });
    expect(rules.wanted).toBeNull();
    expect(sound.played).toEqual([['annette_find', 'a']]);

    blocks.splice(1, 1); // the game removes the found block
    rules.next();
    expect(names(events)).toEqual(['asked', 'found', 'asked']);
    expect(events[2].payload).toEqual({ letter: 's' });
    expect(rules.wanted).toBe('s');
    expect(sound.played).toEqual([['annette_find', 'a'], ['annette_good', 'annette_find', 's']]);
  });

  it('next with no letters left praises once and completes', () => {
    const block = makeBlock('b1', 'a');
    const blocks = [block];
    let carried: BlockState | null = null;
    const { rules, sound, events } = setup(blocks, () => carried);

    rules.talk();
    carried = block;
    rules.talk();
    blocks.length = 0; // the game removes it
    rules.next();

    expect(names(events)).toEqual(['asked', 'found', 'complete']);
    expect(sound.played).toEqual([['annette_find', 'a'], ['annette_good']]);
    expect(rules.done).toBe(true);

    rules.next();
    rules.begin();
    rules.talk();
    expect(names(events)).toEqual(['asked', 'found', 'complete']);
    expect(sound.played.length).toBe(2);
    expect(rules.wanted).toBeNull();
  });

  it('names a wrong block and asks for the wanted one again', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const { rules, sound, events } = setup(blocks, () => blocks[0]);

    rules.talk(); // 's' is in his hands, so she asks for 'a'
    rules.talk();
    expect(sound.played).toEqual([['annette_find', 'a'], ['s', 'annette_find', 'a']]);
    expect(names(events)).toEqual(['asked', 'tryAgain']);
    expect(events[1].payload).toEqual({ wanted: 'a', brought: 's' });
    expect(rules.wanted).toBe('a');
  });

  it('the next request after a find is a different letter', () => {
    for (const random of [() => 0, () => 0.99]) {
      const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
      let carried: BlockState | null = null;
      const { rules, events } = setup(blocks, () => carried, random);

      rules.talk();
      const first = rules.wanted;
      const found = blocks.find((block) => block.letter === first);
      if (!found) throw new Error('the first request had no block');
      carried = found;
      rules.talk(); // she gets the block she asked for
      blocks.splice(blocks.indexOf(found), 1);
      carried = null;
      rules.next(); // praises, then asks for a new one

      expect(rules.wanted).not.toBe(first);
      expect(names(events)).toEqual(['asked', 'found', 'asked']);
      expect(events[2].payload).toEqual({ letter: rules.wanted });
    }
  });

  it("the first request is never the carried block's letter", () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 'a'), makeBlock('b3', 't')];
    const { rules } = setup(blocks, () => blocks[1]);

    rules.talk();
    expect(rules.wanted).toBe('s');
  });

  it('does nothing when there are no blocks', () => {
    const { rules, sound, events } = setup([], () => null);

    rules.talk();
    rules.talk();
    expect(events).toEqual([]);
    expect(sound.played).toEqual([]);
    expect(rules.wanted).toBeNull();
  });

  it('counts duplicate letters once', () => {
    const blocks = [makeBlock('b1', 's'), makeBlock('b2', 's'), makeBlock('b3', 't')];
    const { rules } = setup(blocks, () => null, () => 0.5);

    // Two distinct letters: 0.5 picks the second. Three entries would have picked 's'.
    rules.talk();
    expect(rules.wanted).toBe('t');
  });

  it('keeps the letter chosen by next() when next() is called from the found handler', () => {
    const sound = { playSequence: () => undefined, stop: () => undefined, busy: false, on: () => () => undefined };
    const mk = (id: string, letter: string) => ({ id, letter, position: { x: 0, y: 0, z: 0 }, carried: false, pedestalId: null, silentDrops: false });
    const blocks = [mk('a', 'a'), mk('b', 'b')];
    let carried: (typeof blocks)[number] | null = null;
    const find = new FindRules({ blocks, sound, carried: () => carried, random: () => 0 });
    find.on('found', (e) => {
      blocks.splice(blocks.findIndex((b) => b.id === e.blockId), 1);
      carried = null;
      find.next();
    });
    find.begin();
    carried = blocks.find((b) => b.letter === find.wanted) ?? null;
    find.talk();
    expect(find.wanted).not.toBeNull();
  });
});
