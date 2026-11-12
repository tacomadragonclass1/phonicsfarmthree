import * as THREE from 'three';

export interface LightingRig {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  /** Re-centres the shadow box on the player. */
  follow(target: THREE.Vector3): void;
}

const DEG = Math.PI / 180;
const ELEVATION = 34 * DEG;
const AZIMUTH = 220 * DEG;

/** The sun sits inside its own shadow frustum (near 1, far 80). */
const SUN_DISTANCE = 40;

export function createLightingRig(): LightingRig {
  const group = new THREE.Group();
  group.name = 'lighting';

  const hemisphere = new THREE.HemisphereLight(
    new THREE.Color(0.74, 0.83, 1.0),
    new THREE.Color(0.55, 0.50, 0.42),
    1.15,
  );

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.93, 0.80), 1.9);
  sun.name = 'sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;

  const camera = sun.shadow.camera;
  camera.left = -20;
  camera.right = 20;
  camera.top = 20;
  camera.bottom = -20;
  camera.near = 1;
  camera.far = 80;
  camera.updateProjectionMatrix();

  // Azimuth is world yaw measured from +Z towards +X, as everywhere else here.
  const direction = new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(AZIMUTH),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(AZIMUTH),
  ).normalize();

  const texel = (camera.right - camera.left) / sun.shadow.mapSize.x;

  function follow(target: THREE.Vector3): void {
    // Snapping to whole shadow texels stops the shadow edge shimmering while
    // the player walks. The box is symmetric, so rounding against the world
    // origin keeps the texel grid anchored.
    const snapped = new THREE.Vector3(
      Math.round(target.x / texel) * texel,
      Math.round(target.y / texel) * texel,
      Math.round(target.z / texel) * texel,
    );

    sun.position.copy(snapped).addScaledVector(direction, SUN_DISTANCE);
    sun.target.position.copy(snapped);
    sun.target.updateMatrixWorld();
  }

  group.add(hemisphere);
  group.add(sun);
  // The target must be in the scene graph for its world matrix to update.
  group.add(sun.target);

  follow(new THREE.Vector3(0, 0, 0));

  return { group, sun, follow };
}

export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function createFog(): THREE.FogExp2 {
  return new THREE.FogExp2(new THREE.Color(0.80, 0.86, 0.90), 0.0045);
}
