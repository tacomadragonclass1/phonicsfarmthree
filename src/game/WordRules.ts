import { Emitter } from '../core/Emitter';
import {
  type BlockState,
  type Disposable,
  type EventSource,
  type PedestalState,
  type SoundPlayer,
  type Unsubscribe,
  type WordEvents,
} from '../core/contracts';
import { isWord } from './words';

/** One filled pedestal, remembered at the moment the bell was rung. */
interface Slot {
  pedestalId: string;
  blockId: string;
  letter: string;
}

export interface WordRulesOptions {
  /** Ordered left to right. */
  pedestals: readonly PedestalState[];
  /** Live array of every block. */
  blocks: readonly BlockState[];
  sound: SoundPlayer;
  isWord?: (letters: string) => boolean;
}

/**
 * The word-building row: ring the bell, hear the letters, and find out whether
 * they make a word. No rendering, no audio of its own -- it only asks the
 * shared sound player to speak.
 */
export class WordRules implements EventSource<WordEvents>, Disposable {
  private readonly pedestals: readonly PedestalState[];
  private readonly blocks: readonly BlockState[];
  private readonly sound: SoundPlayer;
  private readonly isWordFn: (letters: string) => boolean;
  private readonly emitter = new Emitter<WordEvents>();
  private readonly unsubscribeSound: Unsubscribe;

  /** The filled pedestals in order, as they were when the bell was rung. */
  private slots: Slot[] = [];
  /** How many of those slots have been reported so far. */
  private nextIndex = 0;
  /** True only while `playSequence` is being called. */
  private starting = false;
  private isSounding = false;

  constructor(options: WordRulesOptions) {
    this.pedestals = options.pedestals;
    this.blocks = options.blocks;
    this.sound = options.sound;
    this.isWordFn = options.isWord ?? isWord;

    this.unsubscribeSound = this.sound.on('letterStarted', (key) => this.onLetterStarted(key));
    this.sound.on('sequenceFinished', () => this.onSequenceFinished());
    this.sound.on('sequenceCancelled', () => this.onSequenceCancelled());
  }

  /** True from ring() until the sounds finish or are cut off. */
  get sounding(): boolean {
    return this.isSounding;
  }

  /** The bell was rung. */
  ring(): void {
    if (this.isSounding) return;

    const slots = this.filledSlots();
    if (slots.length === 0) {
      this.emitter.emit('nothingToSound');
      return;
    }

    this.slots = slots;
    this.nextIndex = 0;

    // `playSequence` replaces whatever was playing and may emit
    // `sequenceCancelled` for it synchronously, so events seen while starting
    // are not ours -- except `letterStarted`, which a player may fire for the
    // new sequence during the call itself.
    this.starting = true;
    this.sound.playSequence(slots.map((slot) => slot.letter));
    this.starting = false;
    this.isSounding = true;
  }

  on<K extends keyof WordEvents>(event: K, listener: (payload: WordEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  dispose(): void {
    this.unsubscribeSound();
  }

  private filledSlots(): Slot[] {
    const blockById = new Map<string, BlockState>();
    for (const block of this.blocks) blockById.set(block.id, block);

    const slots: Slot[] = [];
    for (const pedestal of this.pedestals) {
      if (pedestal.blockId === null) continue;
      const block = blockById.get(pedestal.blockId);
      if (block === undefined) continue;
      slots.push({ pedestalId: pedestal.id, blockId: block.id, letter: block.letter });
    }
    return slots;
  }

  /** The payload key is the letter, but the slot's own letter is authoritative. */
  private onLetterStarted(_key: string): void {
    if (!this.starting && !this.isSounding) return;
    if (this.nextIndex >= this.slots.length) return;

    const slot = this.slots[this.nextIndex];
    this.nextIndex += 1;
    this.emitter.emit('letterSounded', {
      index: this.nextIndex - 1,
      pedestalId: slot.pedestalId,
      blockId: slot.blockId,
      letter: slot.letter,
    });
  }

  private onSequenceFinished(): void {
    if (this.starting) return;
    if (!this.isSounding) return;
    this.isSounding = false;

    const letters = this.slots.map((slot) => slot.letter).join('');
    if (this.slots.length === this.pedestals.length && this.isWordFn(letters)) {
      this.emitter.emit('wordMade', { word: letters, blockIds: this.slots.map((slot) => slot.blockId) });
    } else {
      this.emitter.emit('notYet', { letters });
    }
  }

  private onSequenceCancelled(): void {
    if (this.starting) return;
    if (!this.isSounding) return;
    this.isSounding = false;
  }
}
