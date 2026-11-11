import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

export interface PaintedOptions {
  grainStrength?: number;
  grainScale?: number;
  grainWarm?: number;
  rimStrength?: number;
  rimPower?: number;
}

/** Uniform objects are shared between the material and its program, so the
 * patina can be retuned live through `material.userData.uniforms`. */
export interface PaintedUniforms {
  uGrainStrength: { value: number };
  uGrainScale: { value: number };
  uGrainWarm: { value: number };
  uRimStrength: { value: number };
  uRimPower: { value: number };
}

const DEFAULTS: Required<PaintedOptions> = {
  grainStrength: 0.12,
  grainScale: 7.5,
  grainWarm: 0.5,
  rimStrength: 0.16,
  rimPower: 3.0,
};

/** Every painted material shares one ramp (shadow is a band, not black) and
 * one program, so `customProgramCacheKey` is a constant. */
const PROGRAM_CACHE_KEY = 'painted-material';

let sharedGradient: THREE.DataTexture | null = null;

export function getGradientTexture(): THREE.DataTexture {
  if (sharedGradient === null) {
    const data = new Uint8Array([Math.round(0.55 * 255), Math.round(0.8 * 255), 255]);
    const texture = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    sharedGradient = texture;
  }
  return sharedGradient;
}

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i),                 n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0)),   n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)),   n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1)),   n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
`;

const VARYINGS = /* glsl */ `
varying vec3 vPaintWorldPos;
varying vec3 vPaintWorldNormal;
`;

/** Injects after `marker`; throws rather than silently producing a shader
 * that draws nothing if a future three.js moves the chunk. */
function inject(source: string, marker: string, addition: string): string {
  if (!source.includes(marker)) {
    throw new Error(`PaintedMaterial: could not find ${marker} in the toon shader`);
  }
  return source.replace(marker, `${marker}\n${addition}`);
}

export function createPaintedMaterial(
  map: THREE.Texture,
  options: PaintedOptions = {},
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ map, gradientMap: getGradientTexture() });

  const uniforms: PaintedUniforms = {
    uGrainStrength: { value: options.grainStrength ?? DEFAULTS.grainStrength },
    uGrainScale: { value: options.grainScale ?? DEFAULTS.grainScale },
    uGrainWarm: { value: options.grainWarm ?? DEFAULTS.grainWarm },
    uRimStrength: { value: options.rimStrength ?? DEFAULTS.rimStrength },
    uRimPower: { value: options.rimPower ?? DEFAULTS.rimPower },
  };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);

    // World position and normal cannot come from the stock chunks:
    // `worldpos_vertex` is compiled out without an env map or shadow map, and
    // `vNormal` is view space. Both are needed for a world-anchored patina and
    // an up-facing rim, so they are declared here.
    shader.vertexShader = inject(shader.vertexShader, '#include <common>', VARYINGS);

    // objectNormal is already morphed and skinned at this point, so the world
    // normal is correct for skinned meshes too.
    shader.vertexShader = inject(
      shader.vertexShader,
      '#include <skinnormal_vertex>',
      'vPaintWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );',
    );

    shader.vertexShader = inject(
      shader.vertexShader,
      '#include <project_vertex>',
      /* glsl */ `
vec4 paintWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  paintWorldPosition = instanceMatrix * paintWorldPosition;
#endif
vPaintWorldPos = ( modelMatrix * paintWorldPosition ).xyz;
`,
    );

    shader.fragmentShader = inject(
      shader.fragmentShader,
      '#include <common>',
      `${VARYINGS}
uniform float uGrainStrength;
uniform float uGrainScale;
uniform float uGrainWarm;
uniform float uRimStrength;
uniform float uRimPower;
${NOISE_GLSL}`,
    );

    shader.fragmentShader = inject(
      shader.fragmentShader,
      '#include <map_fragment>',
      /* glsl */ `
float paintNoise = 0.65 * vnoise( vPaintWorldPos * uGrainScale )
                 + 0.35 * vnoise( vPaintWorldPos * uGrainScale * 2.7 + vec3( 11.3 ) );
float paintPatina = ( paintNoise - 0.5 ) * 2.0;
diffuseColor.rgb = clamp(
  diffuseColor.rgb * ( 1.0 + paintPatina * uGrainStrength )
    * mix( vec3( 1.0 ), vec3( 1.06, 1.0, 0.93 ), uGrainWarm * paintPatina ),
  0.0, 1.0 );
`,
    );

    // `totalEmissiveRadiance` is final after this chunk, and `normal` is in
    // scope from `normal_fragment_begin`, which precedes it.
    shader.fragmentShader = inject(
      shader.fragmentShader,
      '#include <emissivemap_fragment>',
      /* glsl */ `
vec3 paintViewDir = normalize( vViewPosition );
float paintRim = pow( 1.0 - clamp( dot( normal, paintViewDir ), 0.0, 1.0 ), uRimPower );
totalEmissiveRadiance += vec3( 0.72, 0.82, 1.0 ) * paintRim * uRimStrength
  * clamp( vPaintWorldNormal.y * 0.5 + 0.5, 0.0, 1.0 );
`,
    );
  };

  material.customProgramCacheKey = () => PROGRAM_CACHE_KEY;

  return material;
}
