import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPathGeometry, createPathTexture, PATH_LIFT } from '../src/world/Paths';
import { PATCHES, PATHS, PROPS, VILLAGE_BLOCKS, VILLAGE_FENCE } from '../src/world/layout';

const slope = (x: number, z: number): number => 0.1 * x + 0.05 * z;

function box(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox as THREE.Box3;
}

describe('paths', () => {
  it('a path is as wide as asked, as long as its points, and lies on the ground', () => {
    const geometry = buildPathGeometry([{ width: 2, points: [{ x: 0, z: 0 }, { x: 0, z: 10 }] }], [], slope);
    const bounds = box(geometry);
    expect(bounds.min.x).toBeCloseTo(-1, 5);
    expect(bounds.max.x).toBeCloseTo(1, 5);
    expect(bounds.min.z).toBeCloseTo(0, 5);
    expect(bounds.max.z).toBeCloseTo(10, 5);

    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      expect(position.getY(i)).toBeCloseTo(slope(position.getX(i), position.getZ(i)) + PATH_LIFT, 5);
    }
  });

  it('every face of a path and of a patch points up, so it is drawn from above', () => {
    const geometry = buildPathGeometry(
      [{ width: 2, points: [{ x: 0, z: 0 }, { x: 3, z: 6 }, { x: -4, z: 9 }] }],
      [{ x: 10, z: 10, radius: 3 }],
      slope,
    );
    const normal = geometry.getAttribute('normal');
    let up = 0;
    for (let i = 0; i < normal.count; i++) {
      // The pinched points at a path's two ends have no face of their own, so no normal.
      const flat = normal.getX(i) === 0 && normal.getY(i) === 0 && normal.getZ(i) === 0;
      if (flat) continue;
      expect(normal.getY(i)).toBeGreaterThan(0.5);
      up += 1;
    }
    expect(up).toBeGreaterThan(normal.count - 12);
  });

  it('the ends are rounded: the first and last cross-sections have no width', () => {
    const geometry = buildPathGeometry([{ width: 2, points: [{ x: 0, z: 0 }, { x: 0, z: 10 }] }], [], () => 0);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      if (z < 1e-6 || z > 10 - 1e-6) expect(Math.abs(position.getX(i))).toBeLessThan(1e-6);
    }
  });

  it('a patch is a disc of the asked radius', () => {
    const bounds = box(buildPathGeometry([], [{ x: 3, z: -2, radius: 4 }], () => 0));
    expect(bounds.min.x).toBeCloseTo(-1, 4);
    expect(bounds.max.x).toBeCloseTo(7, 4);
    expect(bounds.min.z).toBeCloseTo(-6, 4);
    expect(bounds.max.z).toBeCloseTo(2, 4);
  });

  it('the texture is solid in the middle and clear at both edges', () => {
    const texture = createPathTexture(32);
    const data = texture.image.data as Uint8Array;
    for (let y = 0; y < 32; y++) {
      expect(data[(y * 32 + 0) * 4 + 3]).toBe(0);
      expect(data[(y * 32 + 31) * 4 + 3]).toBe(0);
      expect(data[(y * 32 + 16) * 4 + 3]).toBe(255);
    }
  });
});

describe('the layout of paths and letters', () => {
  it('has the eighteen village letters, one block each', () => {
    expect(VILLAGE_BLOCKS.map((block) => block.letter).sort().join('')).toBe('abcdefghijnoprstuw');
    expect(VILLAGE_BLOCKS.every((block) => block.id === `find-${block.letter}`)).toBe(true);
  });

  it('every village letter is inside the fence with room to walk round it', () => {
    for (const block of VILLAGE_BLOCKS) {
      expect(block.x).toBeGreaterThan(VILLAGE_FENCE.west + 1);
      expect(block.x).toBeLessThan(VILLAGE_FENCE.east - 1);
      expect(block.z).toBeGreaterThan(VILLAGE_FENCE.north + 1);
      expect(block.z).toBeLessThan(VILLAGE_FENCE.south - 1);
    }
  });

  it('every path starts and ends where something is: another path, a patch, a prop or a letter', () => {
    const places: { x: number; z: number; reach: number }[] = [
      ...PATCHES.map((patch) => ({ x: patch.x, z: patch.z, reach: patch.radius + 0.5 })),
      ...PROPS.map((prop) => ({ x: prop.x, z: prop.z, reach: 3.6 })),
      ...VILLAGE_BLOCKS.map((block) => ({ x: block.x, z: block.z, reach: 2 })),
    ];
    PATHS.forEach((path, index) => {
      for (const end of [path.points[0], path.points[path.points.length - 1]]) {
        const others = PATHS.filter((_, other) => other !== index).flatMap((other) => other.points);
        const meets = [...places, ...others.map((point) => ({ ...point, reach: 1.2 }))]
          .some((place) => Math.hypot(place.x - end.x, place.z - end.z) <= place.reach);
        expect(meets, `${path.name} ends at ${end.x}, ${end.z} with nothing there`).toBe(true);
      }
    });
  });

  it('no tree, bush or bench stands on a path', () => {
    const solid = PROPS.filter((prop) => !['blossom', 'mushrooms'].includes(prop.model));
    for (const path of PATHS) {
      const curve = new THREE.CatmullRomCurve3(
        path.points.map((point) => new THREE.Vector3(point.x, 0, point.z)), false, 'centripetal');
      const samples = curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.25));
      // The two ends are doors and walls: only the run between them must be clear.
      const run = samples.slice(8, -8);
      for (const prop of solid) {
        const nearest = Math.min(Infinity, ...run.map((point) => Math.hypot(point.x - prop.x, point.z - prop.z)));
        expect(nearest, `${prop.model} at ${prop.x}, ${prop.z} is on "${path.name}"`).toBeGreaterThan(path.width / 2 + 0.3);
      }
    }
  });
});
