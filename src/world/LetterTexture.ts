import * as THREE from 'three';
import type { Disposable } from '../core/contracts';

/** Minimal 2D canvas surface -- injected so this runs in Node tests. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Ctx2DLike | null;
}

/** Only the members the drawing uses. */
export interface Ctx2DLike {
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillStyle: string;
  fillText(text: string, x: number, y: number): void;
}

export type CanvasFactory = (size: number) => CanvasLike;

export interface LetterTextureOptions {
  createCanvas: CanvasFactory;
  fontFamily?: string;
  fontWeight?: number;
  size?: number;
  ink?: string;
}

const DEFAULT_FAMILY = 'Fredoka';
const DEFAULT_WEIGHT = 600;
const DEFAULT_SIZE = 256;
const DEFAULT_INK = '#2a211c';

/** Drawn font size as a fraction of the canvas. */
const FONT_RATIO = 0.78;
/** Shared baseline as a fraction of the canvas. */
const BASELINE_RATIO = 0.66;

function letterKey(letter: string): string {
  const key = letter.toLowerCase();
  if (!/^[a-z]$/.test(key)) {
    throw new RangeError(`LetterTexture needs one a-z character, got "${letter}"`);
  }
  return key;
}

/** One texture per letter, created on first use and reused. */
export class LetterTextureCache implements Disposable {
  private readonly createCanvas: CanvasFactory;
  private readonly fontFamily: string;
  private readonly fontWeight: number;
  private readonly size: number;
  private readonly ink: string;
  private readonly textures = new Map<string, THREE.CanvasTexture<CanvasLike>>();
  private disposed = false;

  constructor(options: LetterTextureOptions) {
    this.createCanvas = options.createCanvas;
    this.fontFamily = options.fontFamily ?? DEFAULT_FAMILY;
    this.fontWeight = options.fontWeight ?? DEFAULT_WEIGHT;
    this.size = options.size ?? DEFAULT_SIZE;
    this.ink = options.ink ?? DEFAULT_INK;
  }

  get(letter: string): THREE.CanvasTexture<CanvasLike> {
    const key = letterKey(letter);
    const cached = this.textures.get(key);
    if (cached) return cached;

    const canvas = this.createCanvas(this.size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LetterTexture canvas has no 2d context');

    ctx.font = `${this.fontWeight} ${FONT_RATIO * this.size}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = this.ink;
    // One baseline for every letter. Centring each glyph's own box would put
    // 'a' lower than 'b' or 'g', so blocks side by side would not read as a line.
    ctx.fillText(key, this.size / 2, BASELINE_RATIO * this.size);

    const texture = new THREE.CanvasTexture<CanvasLike>(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    this.textures.set(key, texture);
    return texture;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}

/** Wait until the web font is usable before any texture is drawn. */
export async function loadLetterFont(
  url: string,
  family: string = DEFAULT_FAMILY,
  weight: number = DEFAULT_WEIGHT,
): Promise<void> {
  // Node tests have no font API; nothing is drawn there, so there is nothing to wait for.
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  // FontFaceDescriptors.weight is a string, so the numeric weight is stringified.
  const face = new FontFace(family, `url(${url})`, { weight: String(weight) });
  await face.load();
  document.fonts.add(face);
}
