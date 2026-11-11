import * as THREE from 'three';
import type { CameraPose } from './FollowCameraRig';

export function createGameCamera(aspect: number): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(32, aspect, 0.3, 400);
}

export function applyPose(camera: THREE.PerspectiveCamera, pose: CameraPose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
}
