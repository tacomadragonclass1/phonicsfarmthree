import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetLibrary, AssetLoadError, type GltfLoaderLike } from '../src/assets/AssetLibrary';
import { MODELS, type ModelId } from '../src/assets/manifest';

const BASE = '/';

interface Fixture {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/** Counts dispose() calls per label so "once each" can be asserted. */
class DisposalCounter {
  private readonly counts = new Map<string, number>();

  track(label: string, target: { dispose: () => void }): void {
    const original = target.dispose.bind(target);
    target.dispose = () => {
      this.counts.set(label, (this.counts.get(label) ?? 0) + 1);
      original();
    };
  }

  count(label: string): number {
    return this.counts.get(label) ?? 0;
  }
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) found.push(node);
  });
  return found;
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) found.push(node);
  });
  return found;
}

function fixture(
  name: string,
  clipNames: readonly string[],
  counter: DisposalCounter,
  options: { skinned?: boolean } = {},
): Fixture {
  const scene = new THREE.Group();
  scene.name = name;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  counter.track(`${name}.geometry`, geometry);

  const material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture();
  material.map = texture;
  counter.track(`${name}.material`, material);
  counter.track(`${name}.texture`, texture);

  if (options.skinned) {
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.name = 'body';
    const bone = new THREE.Bone();
    bone.name = 'hip';
    scene.add(bone); // bones must be descendants of the cloned root
    skinned.skeleton = new THREE.Skeleton([bone]);
    scene.add(skinned);
  } else {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'body';
    scene.add(mesh);
  }

  return { scene, animations: clipNames.map((clip) => new THREE.AnimationClip(clip, 1, [])) };
}

class FakeLoader implements GltfLoaderLike {
  readonly calls: string[] = [];
  private readonly fixtures = new Map<string, () => Fixture>();
  private readonly failing = new Set<string>();

  define(url: string, make: () => Fixture): void {
    this.fixtures.set(url, make);
  }

  /** The next request for this url fails; later ones succeed. */
  failOnce(url: string): void {
    this.failing.add(url);
  }

  loadAsync(url: string): Promise<Fixture> {
    this.calls.push(url);
    const make = this.fixtures.get(url);
    if (!make) return Promise.reject(new Error(`no fixture for ${url}`));
    if (this.failing.has(url)) {
      this.failing.delete(url);
      return Promise.reject(new Error(`network error for ${url}`));
    }
    return Promise.resolve(make());
  }
}

function url(id: ModelId): string {
  return BASE + MODELS[id].url;
}

describe('AssetLibrary', () => {
  it('fetches a model at most once across concurrent loads', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle', 'walk'], counter, { skinned: true }));
    const library = new AssetLibrary({ baseUrl: BASE, loader });

    await Promise.all([library.load(['chuck']), library.load(['chuck'])]);

    expect(loader.calls).toEqual([url('chuck')]);
    expect(library.get('chuck')).toBe(library.get('chuck'));
  });

  it('reports progress for every model in the call', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle', 'walk'], counter));
    loader.define(url('block'), () => fixture('block', [], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });

    const seen: Array<[number, number]> = [];
    await library.load(['chuck', 'block'], (done, total) => seen.push([done, total]));

    expect(seen.map(([done]) => done).sort()).toEqual([1, 2]);
    expect(seen.every(([_, total]) => total === 2)).toBe(true);
    expect(seen[seen.length - 1]).toEqual([2, 2]);
  });

  it('throws when a model is asked for before it is loaded', async () => {
    const library = new AssetLibrary({ baseUrl: BASE, loader: new FakeLoader() });
    expect(library.has('tree')).toBe(false);
    expect(() => library.get('tree')).toThrow(/tree/);
    expect(() => library.instantiate('tree')).toThrow();
  });

  it('rejects with AssetLoadError when a manifest clip is missing', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle'], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });

    const error = await library.load(['chuck']).then(() => undefined).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetLoadError);
    const loadError = error as AssetLoadError;
    expect(loadError.id).toBe('chuck');
    expect(loadError.url).toBe(url('chuck'));
    expect(loadError.message).toContain('chuck');
    expect(loadError.message).toContain('walk');
    expect(library.has('chuck')).toBe(false);
  });

  it('turns a loader rejection into AssetLoadError with the url, and can retry', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('block'), () => fixture('block', [], counter));
    loader.failOnce(url('block'));
    const library = new AssetLibrary({ baseUrl: BASE, loader });

    const error = await library.load(['block']).then(() => undefined).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AssetLoadError);
    expect((error as AssetLoadError).url).toBe(url('block'));
    expect(library.has('block')).toBe(false);

    await library.load(['block']);
    expect(library.has('block')).toBe(true);
    expect(loader.calls).toEqual([url('block'), url('block')]);
  });

  it('instantiates distinct copies that share geometry, materials and textures', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('block'), () => fixture('block', [], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });
    await library.load(['block']);

    const pristine = meshes(library.get('block').scene)[0];
    const first = library.instantiate('block');
    const second = library.instantiate('block');

    expect(first).not.toBe(second);
    expect(first).not.toBe(library.get('block').scene);
    const firstMesh = meshes(first)[0];
    const secondMesh = meshes(second)[0];
    expect(firstMesh).not.toBe(secondMesh);
    expect(firstMesh.geometry).toBe(pristine.geometry);
    expect(secondMesh.geometry).toBe(pristine.geometry);
    expect(firstMesh.material).toBe(pristine.material);
    const firstMaterial = firstMesh.material as THREE.MeshStandardMaterial;
    const pristineMaterial = pristine.material as THREE.MeshStandardMaterial;
    expect(firstMaterial.map).toBe(pristineMaterial.map);
  });

  it('applies the manifest shadow flags on load', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle', 'walk'], counter));
    loader.define(url('terrain'), () => fixture('terrain', [], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });
    await library.load(['chuck', 'terrain']);

    const chuckMesh = meshes(library.get('chuck').scene)[0];
    const terrainMesh = meshes(library.get('terrain').scene)[0];
    expect(chuckMesh.castShadow).toBe(true);
    expect(terrainMesh.castShadow).toBe(false);
    expect(chuckMesh.receiveShadow).toBe(true);
    expect(terrainMesh.receiveShadow).toBe(true);

    // The flags carry to copies made after the walk.
    expect(meshes(library.instantiate('terrain'))[0].castShadow).toBe(false);
    expect(meshes(library.instantiate('chuck'))[0].castShadow).toBe(true);
  });

  it('sets texture anisotropy to 4 without touching the material', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('tree'), () => fixture('tree', [], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });
    await library.load(['tree']);

    const material = meshes(library.get('tree').scene)[0].material as THREE.MeshStandardMaterial;
    expect(material.map?.anisotropy).toBe(4);
    expect(material.color.getHex()).toBe(0xffffff);
  });

  it('gives each copy of a skinned model its own skeleton', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle', 'walk'], counter, { skinned: true }));
    const library = new AssetLibrary({ baseUrl: BASE, loader });
    await library.load(['chuck']);

    const pristine = skinnedMeshes(library.get('chuck').scene)[0];
    const first = skinnedMeshes(library.instantiate('chuck'))[0];
    const second = skinnedMeshes(library.instantiate('chuck'))[0];

    expect(first).not.toBe(second);
    expect(first.skeleton).not.toBe(second.skeleton);
    expect(first.skeleton).not.toBe(pristine.skeleton);
    expect(first.skeleton.bones[0]).not.toBe(second.skeleton.bones[0]);
    expect(first.skeleton.bones[0]).not.toBe(pristine.skeleton.bones[0]);
    expect(first.geometry).toBe(pristine.geometry);
  });

  it('disposes each geometry, material and texture exactly once', async () => {
    const counter = new DisposalCounter();
    const loader = new FakeLoader();
    loader.define(url('chuck'), () => fixture('chuck', ['idle', 'walk'], counter, { skinned: true }));
    loader.define(url('block'), () => fixture('block', [], counter));
    const library = new AssetLibrary({ baseUrl: BASE, loader });
    await library.load(['chuck', 'block']);

    // Copies share resources, so they must not be disposed separately.
    library.instantiate('chuck');
    library.instantiate('chuck');
    library.instantiate('block');

    library.dispose();
    expect(counter.count('chuck.geometry')).toBe(1);
    expect(counter.count('chuck.material')).toBe(1);
    expect(counter.count('chuck.texture')).toBe(1);
    expect(counter.count('block.geometry')).toBe(1);
    expect(counter.count('block.material')).toBe(1);
    expect(counter.count('block.texture')).toBe(1);

    library.dispose();
    expect(counter.count('chuck.geometry')).toBe(1);
  });
});
