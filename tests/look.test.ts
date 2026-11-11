import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { createPaintedMaterial, getGradientTexture } from '../src/assets/look/PaintedMaterial';
import { addOutline, createInkMaterial, getInkMaterial, setInkResolution } from '../src/assets/look/InkOutline';
import { applyLook } from '../src/assets/look/applyLook';
import { createFog, createLightingRig } from '../src/assets/look/LightingRig';

function makeTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

/** onBeforeCompile is handed the program parameters; only the shader strings
 * and uniforms matter in a Node test. */
function compile(material: THREE.Material): {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
} {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    defines: {},
  };
  material.onBeforeCompile(
    shader as unknown as WebGLProgramParametersWithUniforms,
    undefined as unknown as THREE.WebGLRenderer,
  );
  return shader;
}

function skinnedMesh(map: THREE.Texture): THREE.SkinnedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 1, 1, 1], 4));

  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ map }));
  mesh.name = 'Chuck';
  mesh.add(bone);
  mesh.bind(skeleton);
  return mesh;
}

describe('PaintedMaterial', () => {
  it('is a toon material that keeps the map and uses the shared ramp', () => {
    const map = makeTexture();
    const material = createPaintedMaterial(map);

    expect(material.isMeshToonMaterial).toBe(true);
    expect(material.map).toBe(map);
    expect(material.gradientMap).toBe(getGradientTexture());
    expect(material.transparent).toBe(false);
  });

  it('shares one gradient texture between materials', () => {
    const first = createPaintedMaterial(makeTexture());
    const second = createPaintedMaterial(makeTexture());
    expect(first.gradientMap).toBe(second.gradientMap);
    const ramp = getGradientTexture();
    expect(ramp.width).toBe(3);
    expect(ramp.height).toBe(1);
    expect(ramp.magFilter).toBe(THREE.NearestFilter);
    expect(ramp.minFilter).toBe(THREE.NearestFilter);
  });

  it('injects the patina after map_fragment and the rim after emissivemap_fragment', () => {
    const material = createPaintedMaterial(makeTexture());
    const shader = compile(material);

    const patinaAt = shader.fragmentShader.indexOf('#include <map_fragment>');
    const patinaBody = shader.fragmentShader.slice(patinaAt);
    expect(patinaBody).toContain('vnoise( vPaintWorldPos * uGrainScale )');
    expect(patinaBody).toContain('0.35 * vnoise( vPaintWorldPos * uGrainScale * 2.7 + vec3( 11.3 ) )');
    expect(patinaBody).toContain('diffuseColor.rgb = clamp(');

    const emissiveAt = shader.fragmentShader.indexOf('#include <emissivemap_fragment>');
    const rimBody = shader.fragmentShader.slice(emissiveAt);
    expect(rimBody).toContain('totalEmissiveRadiance += vec3( 0.72, 0.82, 1.0 )');
    expect(rimBody).toContain('vPaintWorldNormal.y * 0.5 + 0.5');

    // The skinning chunks must survive: a skinned mesh still deforms.
    expect(shader.vertexShader).toContain('#include <skinning_vertex>');
    expect(shader.vertexShader).toContain('#include <skinnormal_vertex>');
    expect(shader.vertexShader).toContain('varying vec3 vPaintWorldPos;');
  });

  it('exposes live-tunable uniforms and one shared program key', () => {
    const material = createPaintedMaterial(makeTexture());
    const shader = compile(material);

    const uniforms = material.userData.uniforms as Record<string, { value: number }>;
    expect(uniforms.uGrainStrength.value).toBeCloseTo(0.12, 12);
    expect(uniforms.uGrainScale.value).toBeCloseTo(7.5, 12);
    expect(uniforms.uGrainWarm.value).toBeCloseTo(0.5, 12);
    expect(uniforms.uRimStrength.value).toBeCloseTo(0.16, 12);
    expect(uniforms.uRimPower.value).toBeCloseTo(3.0, 12);

    // Same object, so tuning through userData reaches the program.
    expect(shader.uniforms.uGrainStrength).toBe(uniforms.uGrainStrength);

    expect(material.customProgramCacheKey()).toBe(
      createPaintedMaterial(makeTexture()).customProgramCacheKey(),
    );
  });
});

describe('InkOutline', () => {
  it('returns one shared ink material', () => {
    const ink = getInkMaterial();
    expect(getInkMaterial()).toBe(ink);
    expect(ink.side).toBe(THREE.BackSide);
    expect(ink.transparent).toBe(false);
    expect(ink.depthWrite).toBe(true);
    expect(ink.fog).toBe(false);
  });

  it('updates the resolution uniform', () => {
    const ink = createInkMaterial();
    setInkResolution(ink, 1280, 720);
    const resolution = ink.uniforms.resolution.value as THREE.Vector2;
    expect(resolution.x).toBe(1280);
    expect(resolution.y).toBe(720);
  });

  it('offsets in clip space by a pixel count, not in model space', () => {
    const ink = createInkMaterial();
    expect(ink.vertexShader).toContain('gl_Position.xy +=');
    expect(ink.vertexShader).toContain('gl_Position.w');
    expect(ink.vertexShader).toContain('resolution.y / 800.0');
    expect(ink.vertexShader).toContain('#include <skinning_vertex>');
    expect(ink.vertexShader).toContain('#include <morphtarget_vertex>');
    // Alpha stays 1 so the hull stays in the opaque queue.
    expect(ink.fragmentShader).toContain('vec4( colour, 1.0 )');
    expect(ink.fragmentShader).toContain('#include <colorspace_fragment>');
  });

  it('adds a hull that shares geometry and is BackSide', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'Berry';
    const hull = addOutline(mesh);

    expect(hull).toBe(mesh.children[0]);
    expect(hull.geometry).toBe(mesh.geometry);
    expect(hull.material).toBe(getInkMaterial());
    expect((hull.material as THREE.ShaderMaterial).side).toBe(THREE.BackSide);
    expect(hull.name).toBe('Berry_ink');
    expect(hull.userData.isOutline).toBe(true);
    expect(hull.castShadow).toBe(false);
    expect(hull.receiveShadow).toBe(false);
    expect(addOutline(mesh)).toBe(hull);
  });

  it('binds a skinned hull to the same skeleton and bind matrix', () => {
    const mesh = skinnedMesh(makeTexture());
    const hull = addOutline(mesh);

    expect(hull).toBeInstanceOf(THREE.SkinnedMesh);
    const skinned = hull as THREE.SkinnedMesh;
    expect(skinned.skeleton).toBe(mesh.skeleton);
    expect(skinned.bindMatrix.equals(mesh.bindMatrix)).toBe(true);
    expect(skinned.geometry).toBe(mesh.geometry);
  });
});

function makeMesh(name: string, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  return mesh;
}

function outlinesOf(root: THREE.Object3D): THREE.Mesh[] {
  return meshesOf(root).filter((mesh) => mesh.userData.isOutline === true);
}

describe('applyLook', () => {
  it('replaces a mapped standard material with a toon one that keeps the map', () => {
    const map = makeTexture();
    const root = new THREE.Group();
    const mesh = makeMesh('Cottage', new THREE.MeshStandardMaterial({ map }));
    root.add(mesh);

    applyLook(root);

    expect(mesh.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect((mesh.material as THREE.MeshToonMaterial).map).toBe(map);
    expect(outlinesOf(root)).toHaveLength(1);
    expect(mesh.children[0]).toBeInstanceOf(THREE.Mesh);
  });

  it('leaves an unmapped material identical and gives it no hull', () => {
    const root = new THREE.Group();
    const body = makeMesh('Cube', new THREE.MeshStandardMaterial({ map: makeTexture() }));
    const face = makeMesh('LetterFace', new THREE.MeshStandardMaterial());
    root.add(body, face);

    const source = face.material;
    applyLook(root);

    expect(face.material).toBe(source);
    expect(face.children.length).toBe(0);
    expect(outlinesOf(root)).toHaveLength(1);
    expect(outlinesOf(root)[0]).toBe(body.children[0]);
  });

  it('shares the painted material between meshes sharing a source material', () => {
    const source = new THREE.MeshStandardMaterial({ map: makeTexture() });
    const root = new THREE.Group();
    const a = makeMesh('BerryA', source);
    const b = makeMesh('BerryB', source);
    root.add(a, b);

    applyLook(root);

    expect(a.material).toBe(b.material);
    expect(a.material).toBeInstanceOf(THREE.MeshToonMaterial);
  });

  it('adds exactly one hull per mapped mesh and none on the second call', () => {
    const root = new THREE.Group();
    const map = makeTexture();
    for (let i = 0; i < 3; i += 1) {
      root.add(makeMesh(`Berry${i}`, new THREE.MeshStandardMaterial({ map })));
    }

    applyLook(root);
    expect(outlinesOf(root)).toHaveLength(3);

    applyLook(root);
    expect(outlinesOf(root)).toHaveLength(3);
    expect(meshesOf(root).filter((mesh) => !mesh.userData.isOutline)).toHaveLength(3);
  });

  it('skips hulls when outline is false', () => {
    const root = new THREE.Group();
    root.add(makeMesh('Berry', new THREE.MeshStandardMaterial({ map: makeTexture() })));

    applyLook(root, { outline: false });

    expect(outlinesOf(root)).toHaveLength(0);
    expect(meshesOf(root)[0].material).toBeInstanceOf(THREE.MeshToonMaterial);
  });
});

describe('LightingRig', () => {
  it('has one hemisphere light and one shadow-casting sun', () => {
    const rig = createLightingRig();

    let hemisphereLights = 0;
    let directionalLights = 0;
    rig.group.traverse((object) => {
      if (object instanceof THREE.HemisphereLight) hemisphereLights += 1;
      if (object instanceof THREE.DirectionalLight) directionalLights += 1;
    });
    expect(hemisphereLights).toBe(1);
    expect(directionalLights).toBe(1);

    expect(rig.sun.castShadow).toBe(true);
    expect(rig.sun.shadow.mapSize.x).toBe(2048);
    expect(rig.sun.shadow.mapSize.y).toBe(2048);
    expect(rig.sun.shadow.camera.left).toBe(-20);
    expect(rig.sun.shadow.camera.right).toBe(20);
    expect(rig.sun.shadow.camera.near).toBe(1);
    expect(rig.sun.shadow.camera.far).toBe(80);
    expect(rig.sun.shadow.bias).toBeCloseTo(-0.0004, 12);
    expect(rig.sun.shadow.normalBias).toBeCloseTo(0.03, 12);
  });

  it('follow moves the light and its target by the same offset', () => {
    const rig = createLightingRig();
    rig.follow(new THREE.Vector3(3, 0, 5));

    const beforeLight = rig.sun.position.clone();
    const beforeTarget = rig.sun.target.position.clone();

    rig.follow(new THREE.Vector3(11.3, 0.7, -4.2));

    const lightDelta = rig.sun.position.clone().sub(beforeLight);
    const targetDelta = rig.sun.target.position.clone().sub(beforeTarget);
    expect(lightDelta.distanceTo(targetDelta)).toBeLessThan(1e-9);

    // Snapped to whole shadow texels, so the shadow box does not shimmer.
    const texel = (rig.sun.shadow.camera.right - rig.sun.shadow.camera.left) / rig.sun.shadow.mapSize.x;
    expect(Math.abs(rig.sun.target.position.x / texel - Math.round(rig.sun.target.position.x / texel))).toBeLessThan(1e-9);

    // The sun stays on its elevation and azimuth.
    const offset = rig.sun.position.clone().sub(rig.sun.target.position);
    expect(offset.length()).toBeCloseTo(40, 6);
    expect(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) / (Math.PI / 180)).toBeCloseTo(34, 6);
    expect(Math.atan2(offset.x, offset.z) / (Math.PI / 180)).toBeCloseTo(40, 6);
  });

  it('builds the fog', () => {
    const fog = createFog();
    expect(fog instanceof THREE.FogExp2).toBe(true);
    expect(fog.density).toBeCloseTo(0.0045, 12);
    expect(fog.color.r).toBeCloseTo(0.8, 12);
    expect(fog.color.g).toBeCloseTo(0.86, 12);
    expect(fog.color.b).toBeCloseTo(0.9, 12);
  });
});
