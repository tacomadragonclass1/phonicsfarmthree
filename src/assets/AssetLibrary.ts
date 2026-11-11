import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Disposable } from '../core/contracts';
import { MODELS, type ModelId } from './manifest';

/** Texture anisotropy the game wants for ground and wall textures. */
const ANISOTROPY = 4;

/** Every failure this module reports, so callers can tell which model broke. */
export class AssetLoadError extends Error {
  readonly id: string;
  readonly url: string;
  override readonly cause: unknown;

  constructor(id: string, url: string, cause: unknown, message: string) {
    super(message);
    this.name = 'AssetLoadError';
    this.id = id;
    this.url = url;
    this.cause = cause;
  }
}

export interface LoadedModel {
  readonly id: ModelId;
  /** The pristine loaded scene. Never add this to the world; use instantiate(). */
  readonly scene: THREE.Group;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
}

/** Anything with the shape of GLTFLoader.loadAsync -- injected for tests. */
export interface GltfLoaderLike {
  loadAsync(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>;
}

export interface AssetLibraryOptions {
  /** Site base such as '/' or './'. Defaults to Vite's BASE_URL. */
  baseUrl?: string;
  /** Loader; a real GLTFLoader by default so tests can inject a fake. */
  loader?: GltfLoaderLike;
}

/** Reads Vite's base only when the caller did not pass one, so Node callers
 *  that pass a baseUrl never touch `import.meta.env`. */
function defaultBaseUrl(): string {
  const env: { BASE_URL?: string } | undefined = import.meta.env;
  return env?.BASE_URL ?? '/';
}

function firstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | undefined {
  let found: THREE.SkinnedMesh | undefined;
  root.traverse((node) => {
    if (!found && node instanceof THREE.SkinnedMesh) found = node;
  });
  return found;
}

/** Every texture a material references, whatever slot it is in. */
function texturesOf(material: THREE.Material): unknown[] {
  return Object.values(material);
}

/**
 * Loaded GLTF models, held once and copied on demand. Copies share geometry,
 * materials and textures with the pristine scene, so disposing the library
 * disposes each resource once.
 */
export class AssetLibrary implements Disposable {
  private readonly baseUrl: string;
  private readonly loader: GltfLoaderLike;
  private readonly loaded = new Map<ModelId, LoadedModel>();
  /** One promise per id, so two concurrent loads fetch at most once. */
  private readonly inflight = new Map<ModelId, Promise<LoadedModel>>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private disposed = false;

  constructor(options: AssetLibraryOptions = {}) {
    this.baseUrl = options.baseUrl ?? defaultBaseUrl();
    this.loader = options.loader ?? new GLTFLoader();
  }

  /** Full url the loader would be given for a model. */
  urlFor(id: ModelId): string {
    return this.baseUrl + MODELS[id].url;
  }

  /**
   * Load the given models (deduplicated, in parallel). `total` is the number
   * of distinct ids in this call and `done` counts the ones this call has
   * finished, including ids already loaded.
   */
  async load(ids: readonly ModelId[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const unique = [...new Set(ids)];
    const total = unique.length;
    let done = 0;
    await Promise.all(
      unique.map(async (id) => {
        await this.fetch(id);
        done += 1;
        onProgress?.(done, total);
      }),
    );
  }

  has(id: ModelId): boolean {
    return this.loaded.has(id);
  }

  get(id: ModelId): LoadedModel {
    const model = this.loaded.get(id);
    if (!model) {
      throw new AssetLoadError(id, this.urlFor(id), undefined, `model "${id}" is not loaded`);
    }
    return model;
  }

  /**
   * A fresh copy for the scene graph. Skinned models are cloned with
   * SkeletonUtils.clone so each copy has its own skeleton; others with
   * `.clone(true)`. Geometry, materials and textures stay shared.
   */
  instantiate(id: ModelId): THREE.Group {
    const model = this.get(id);
    // SkeletonUtils.clone is typed Object3D -> Object3D, but it always returns
    // the same kind of node it was given.
    const copy = firstSkinnedMesh(model.scene)
      ? (SkeletonUtils.clone(model.scene) as THREE.Group)
      : model.scene.clone(true);
    return copy;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.loaded.clear();
    this.inflight.clear();
  }

  private fetch(id: ModelId): Promise<LoadedModel> {
    const existing = this.inflight.get(id);
    if (existing) return existing;

    const url = this.urlFor(id);
    const promise = this.loader
      .loadAsync(url)
      .then((result) => this.adopt(id, url, result.scene, result.animations))
      .catch((error: unknown) => {
        // Forget the failed promise so the id can be retried.
        this.inflight.delete(id);
        if (error instanceof AssetLoadError) throw error;
        throw new AssetLoadError(id, url, error, `model "${id}" failed to load from ${url}`);
      });

    this.inflight.set(id, promise);
    return promise;
  }

  /** Checks the clips the game relies on, then applies the manifest flags. */
  private adopt(id: ModelId, url: string, scene: THREE.Group, animations: readonly THREE.AnimationClip[]): LoadedModel {
    const clips = new Map<string, THREE.AnimationClip>();
    for (const clip of animations) {
      if (!clips.has(clip.name)) clips.set(clip.name, clip);
    }
    for (const name of MODELS[id].clips) {
      if (!clips.has(name)) {
        throw new AssetLoadError(id, url, undefined, `model "${id}" loaded from ${url} is missing clip "${name}"`);
      }
    }

    const castsShadow = MODELS[id].castsShadow;
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = castsShadow;
      node.receiveShadow = true;
      this.geometries.add(node.geometry);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        this.materials.add(material);
        for (const value of texturesOf(material)) {
          if (value instanceof THREE.Texture) {
            value.anisotropy = ANISOTROPY;
            this.textures.add(value);
          }
        }
      }
    });

    const model: LoadedModel = { id, scene, clips };
    this.loaded.set(id, model);
    return model;
  }
}
