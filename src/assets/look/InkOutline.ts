import * as THREE from 'three';

export interface InkOptions {
  widthPx?: number;
  color?: THREE.ColorRepresentation;
  variation?: number;
}

export interface InkUniforms {
  [uniform: string]: { value: unknown };
  resolution: { value: THREE.Vector2 };
  widthPx: { value: number };
  inkColor: { value: THREE.Color };
  variation: { value: number };
}

const DEFAULTS = { widthPx: 3.4, variation: 0.3 };
const INK = new THREE.Color(0.13, 0.10, 0.09);

/** Authored at this viewport height; `resolution.y / 800.0` rescales it. */
const AUTHORED_HEIGHT = 800;

let sharedInk: THREE.ShaderMaterial | null = null;

/** One ink material for the whole game: the hulls differ only by geometry. */
export function getInkMaterial(options: InkOptions = {}): THREE.ShaderMaterial {
  if (sharedInk === null) sharedInk = createInkMaterial(options);
  return sharedInk;
}

export function createInkMaterial(options: InkOptions = {}): THREE.ShaderMaterial {
  const uniforms: InkUniforms = {
    resolution: { value: new THREE.Vector2(1, 1) },
    widthPx: { value: options.widthPx ?? DEFAULTS.widthPx },
    inkColor: { value: new THREE.Color(options.color ?? INK) },
    variation: { value: options.variation ?? DEFAULTS.variation },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    // Alpha must stay 1: a hull that writes alpha < 1 leaves the opaque queue
    // and silently never draws.
    vertexShader: /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

uniform vec2 resolution;
uniform float widthPx;

varying vec3 vWorldPos;

void main() {

  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>

  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>

  vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;

  // The offset has to be a pixel count, so it happens in clip space: a
  // model-space offset is a fixed number of metres and reads as fat on a
  // berry, invisible on a house. defaultnormal_vertex has already flipped the
  // normal for BackSide, so this pushes the hull outward.
  vec2 screenNormal = transformedNormal.xy;
  if ( length( screenNormal ) > 1e-6 ) {
    gl_Position.xy += normalize( screenNormal ) * widthPx * gl_Position.w / resolution * 2.0
      * ( resolution.y / ${AUTHORED_HEIGHT}.0 );
  }
}
`,
    fragmentShader: /* glsl */ `
#include <common>

uniform vec3 inkColor;
uniform float variation;

varying vec3 vWorldPos;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {

  vec3 cell = floor( vWorldPos * 9.0 );
  float wobble = mix( 1.0 - variation, 1.0, hash13( cell ) );
  vec3 colour = mix( vec3( 0.55, 0.55, 0.52 ), inkColor, 0.94 * wobble );

  gl_FragColor = vec4( colour, 1.0 );
  #include <colorspace_fragment>
}
`,
    side: THREE.BackSide,
    fog: false,
    depthWrite: true,
  });
}

export function setInkResolution(material: THREE.ShaderMaterial, width: number, height: number): void {
  const resolution = material.uniforms.resolution.value as THREE.Vector2;
  resolution.set(width, height);
}

/** Inverted hull: a child so it inherits the mesh's transform, sharing the
 * geometry so it costs nothing extra to upload. */
export function addOutline(mesh: THREE.Mesh | THREE.SkinnedMesh): THREE.Mesh {
  const existing = mesh.children.find((child) => child.userData.isOutline === true);
  if (existing !== undefined) return existing as THREE.Mesh;

  const ink = getInkMaterial();
  const hull = mesh instanceof THREE.SkinnedMesh
    ? new THREE.SkinnedMesh(mesh.geometry, ink)
    : new THREE.Mesh(mesh.geometry, ink);

  hull.name = `${mesh.name}_ink`;
  hull.userData.isOutline = true;
  hull.castShadow = false;
  hull.receiveShadow = false;

  mesh.add(hull);

  if (mesh instanceof THREE.SkinnedMesh && hull instanceof THREE.SkinnedMesh) {
    // Same skeleton, same bind matrix: the hull deforms with the character.
    hull.bind(mesh.skeleton, mesh.bindMatrix.clone());
  }

  return hull;
}
