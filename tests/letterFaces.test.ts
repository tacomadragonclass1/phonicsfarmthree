import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LetterTextureCache,
  loadLetterFont,
  type CanvasLike,
  type Ctx2DLike,
} from '../src/world/LetterTexture';
import { FACE_NAMES, LetterFaces, facePlacements } from '../src/world/LetterFaces';

interface DrawCall {
  text: string;
  x: number;
  y: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillStyle: string;
}

class FakeCtx implements Ctx2DLike {
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fillStyle = '';
  readonly calls: DrawCall[] = [];

  fillText(text: string, x: number, y: number): void {
    // Snapshot the state at draw time, not the values set afterwards.
    this.calls.push({
      text,
      x,
      y,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      fillStyle: this.fillStyle,
    });
  }
}

class FakeCanvas implements CanvasLike {
  readonly ctx = new FakeCtx();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(type: '2d'): Ctx2DLike | null {
    return type === '2d' ? this.ctx : null;
  }
}

/** A cache plus the canvases it made, so the test can read what was drawn. */
function fakeCache(): { cache: LetterTextureCache; canvases: FakeCanvas[] } {
  const canvases: FakeCanvas[] = [];
  const cache = new LetterTextureCache({
    createCanvas: (size) => {
      const canvas = new FakeCanvas(size, size);
      canvases.push(canvas);
      return canvas;
    },
  });
  return { cache, canvases };
}

function callFor(canvases: FakeCanvas[], letter: string): DrawCall {
  const call = canvases.flatMap((c) => c.ctx.calls).find((c) => c.text === letter);
  if (!call) throw new Error(`no draw recorded for "${letter}"`);
  return call;
}

describe('LetterTextureCache', () => {
  it('returns the same texture for the same letter, whatever the case', () => {
    const { cache } = fakeCache();
    expect(cache.get('a')).toBe(cache.get('A'));
    expect(cache.get('a')).not.toBe(cache.get('b'));
  });

  it('draws once per letter', () => {
    const { cache, canvases } = fakeCache();
    cache.get('a');
    cache.get('a');
    expect(canvases).toHaveLength(1);
    expect(canvases[0].ctx.calls).toHaveLength(1);
  });

  it('rejects anything that is not one a-z character', () => {
    const { cache } = fakeCache();
    for (const bad of ['', 'ab', '1', ' ', '.', 'é']) {
      expect(() => cache.get(bad)).toThrow(RangeError);
    }
  });

  it('uses the weight and family in the font string', () => {
    const { cache, canvases } = fakeCache();
    cache.get('a');
    const call = callFor(canvases, 'a');
    expect(call.font).toContain('600');
    expect(call.font).toContain('Fredoka');
    expect(call.textAlign).toBe('center');
    expect(call.textBaseline).toBe('alphabetic');
    expect(call.fillStyle).toBe('#2a211c');
  });

  it('keeps one baseline for every letter so ascenders and descenders line up', () => {
    const { cache, canvases } = fakeCache();
    for (const letter of ['a', 'b', 'g']) cache.get(letter);
    const baselines = ['a', 'b', 'g'].map((letter) => callFor(canvases, letter).y);
    expect(baselines[0]).toBeCloseTo(0.66 * 256, 10);
    expect(baselines).toEqual([baselines[0], baselines[0], baselines[0]]);
  });

  it('sets the texture properties the renderer needs', () => {
    const { cache } = fakeCache();
    const texture = cache.get('a');
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.anisotropy).toBe(4);
    expect(texture.generateMipmaps).toBe(true);
  });

  it('disposes its own textures', () => {
    const { cache } = fakeCache();
    const texture = cache.get('a');
    let disposed = false;
    texture.addEventListener('dispose', () => {
      disposed = true;
    });
    cache.dispose();
    expect(disposed).toBe(true);
  });

  it('resolves immediately where there is no font API', async () => {
    await expect(loadLetterFont('https://example.test/fredoka.woff2')).resolves.toBeUndefined();
  });
});

describe('facePlacements', () => {
  it('uses the measured model defaults', () => {
    const placements = facePlacements();
    const lift = 0.002;
    const half = 0.4178;
    const centreY = 0.4847;
    expect(placements.Front.position).toEqual([0, centreY, half + lift]);
    expect(placements.Top.position).toEqual([0, centreY + half + lift, 0]);
    expect(placements.Top.rotation).toEqual([-Math.PI / 2, 0, 0]);
  });

  it('honours custom options', () => {
    const placements = facePlacements({ half: 0.5, centreY: 1, lift: 0.01 });
    expect(placements.Right.position).toEqual([0.51, 1, 0]);
    expect(placements.Back.position).toEqual([0, 1, -0.51]);
  });
});

describe('LetterFaces', () => {
  function makeFaces(): { faces: LetterFaces; cache: LetterTextureCache; canvases: FakeCanvas[] } {
    const { cache, canvases } = fakeCache();
    return { faces: new LetterFaces(cache), cache, canvases };
  }

  function meshesOf(faces: LetterFaces): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] {
    return faces.group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  }

  it('has five meshes named after the model faces', () => {
    const { faces } = makeFaces();
    expect(faces.group.children).toHaveLength(5);
    expect(faces.group.children.map((child) => child.name)).toEqual([...FACE_NAMES]);
  });

  it('shares one geometry and one material across the five meshes', () => {
    const { faces } = makeFaces();
    const meshes = meshesOf(faces);
    const geometry = meshes[0].geometry;
    const material = meshes[0].material;
    for (const mesh of meshes) {
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.material).toBe(material);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.renderOrder).toBe(1);
    }
    expect(geometry.parameters.width).toBe(0.62);
    expect(material.alphaTest).toBe(0.5);
    expect(material.depthWrite).toBe(false);
    expect(material.polygonOffset).toBe(true);
  });

  it('puts each face normal pointing away from the block centre', () => {
    const { faces } = makeFaces();
    const centre = new THREE.Vector3(0, 0.4847, 0);
    for (const mesh of meshesOf(faces)) {
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(
        new THREE.Euler(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z),
      );
      const outward = new THREE.Vector3().subVectors(mesh.position, centre);
      expect(normal.dot(outward)).toBeGreaterThan(0);
    }
  });

  it('makes the top letter read upright from the +Z side', () => {
    const { faces } = makeFaces();
    const top = faces.group.children.find((child) => child.name === 'Top');
    if (!top) throw new Error('no Top mesh');
    const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(top.rotation.x, top.rotation.y, top.rotation.z));
    expect(up.x).toBeCloseTo(0, 10);
    expect(up.y).toBeCloseTo(0, 10);
    expect(up.z).toBeCloseTo(-1, 10);
  });

  it('setLetter changes the map on the shared material', () => {
    const { faces, cache } = makeFaces();
    const meshes = meshesOf(faces);
    const material = meshes[0].material;
    expect(material.map).toBeNull();
    faces.setLetter('a');
    expect(material.map).toBe(cache.get('a'));
    faces.setLetter('b');
    expect(material.map).toBe(cache.get('b'));
    // Every mesh sees it because they share one material.
    for (const mesh of meshes) {
      expect(mesh.material.map).toBe(material.map);
    }
  });

  it('disposes geometry and material but not the cached textures', () => {
    const { cache, canvases } = fakeCache();
    const faces = new LetterFaces(cache);
    const texture = cache.get('a');
    faces.setLetter('a');

    let textureDisposed = false;
    let geometryDisposed = false;
    let materialDisposed = false;
    texture.addEventListener('dispose', () => {
      textureDisposed = true;
    });
    const meshes = meshesOf(faces);
    for (const mesh of meshes) {
      mesh.geometry.addEventListener('dispose', () => {
        geometryDisposed = true;
      });
    }
    meshes[0].material.addEventListener('dispose', () => {
      materialDisposed = true;
    });

    faces.dispose();
    expect(geometryDisposed).toBe(true);
    expect(materialDisposed).toBe(true);
    expect(textureDisposed).toBe(false);

    // The cache still owns the texture: it is shared by every block.
    expect(cache.get('a')).toBe(texture);
    expect(canvases).toHaveLength(1);
    cache.dispose();
    expect(textureDisposed).toBe(true);
  });
});
