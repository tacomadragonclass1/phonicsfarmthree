import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CameraProbe, Vec3 } from '../src/core/contracts';
import { FollowCameraRig, screenToWorld } from '../src/camera/FollowCameraRig';
import { applyPose, createGameCamera } from '../src/camera/applyRig';

const DEG = Math.PI / 180;
const PITCH = 24 * DEG;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

class FakeProbe implements CameraProbe {
  fraction = 1;
  last: { from: Vec3; to: Vec3; radius: number } | null = null;

  sweep(from: Vec3, to: Vec3, radius: number): number {
    this.last = { from: { ...from }, to: { ...to }, radius };
    return this.fraction;
  }
}

describe('FollowCameraRig', () => {
  it('snap puts the camera at full distance behind along yaw at the pitch', () => {
    const rig = new FollowCameraRig({ homeYaw: 0.7 });
    rig.snap({ x: 1, y: 0, z: 2 });

    expect(rig.pose.lookAt).toEqual({ x: 1, y: 1, z: 2 });
    expect(rig.pose.yaw).toBeCloseTo(0.7, 12);
    expect(rig.pose.distance).toBe(11);
    const back = { x: Math.sin(0.7), z: Math.cos(0.7) };
    expect(rig.pose.position.x).toBeCloseTo(1 - back.x * Math.cos(PITCH) * 11, 10);
    expect(rig.pose.position.z).toBeCloseTo(2 - back.z * Math.cos(PITCH) * 11, 10);
    expect(rig.pose.position.y).toBeCloseTo(1 + Math.sin(PITCH) * 11, 10);
    expect(Math.hypot(
      rig.pose.position.x - rig.pose.lookAt.x,
      rig.pose.position.y - rig.pose.lookAt.y,
      rig.pose.position.z - rig.pose.lookAt.z,
    )).toBeCloseTo(11, 10);
    // Behind the look-at means opposite the way the camera looks.
    expect(rig.pose.position.z).toBeLessThan(rig.pose.lookAt.z);
  });

  it('the first update without a snap behaves as snap then update', () => {
    const rig = new FollowCameraRig();
    const pose = rig.update({ x: 3, y: 0, z: -4 }, ZERO, 0, 0.1);
    const snapped = new FollowCameraRig();
    snapped.snap({ x: 3, y: 0, z: -4 });
    expect(pose).toEqual(snapped.pose);
  });

  it('standing still inside the deadzone does not move focus', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    const before = { ...rig.pose.lookAt };
    rig.update({ x: 0.2, y: 0, z: 0 }, ZERO, 0, 0.1);
    expect(rig.pose.lookAt).toEqual(before);
  });

  it('walking builds lead that saturates, then decays after stopping', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    for (let i = 0; i < 50; i += 1) rig.update(ZERO, { x: 6.4, y: 0, z: 0 }, 0, 0.1);
    // Steady focus sits at lead minus the deadzone ahead of the target.
    expect(rig.pose.lookAt.x).toBeCloseTo(1.6 - 0.35, 4);

    for (let i = 0; i < 50; i += 1) rig.update(ZERO, ZERO, 0, 0.1);
    expect(rig.pose.lookAt.x).toBeCloseTo(0.35, 3);

    const slow = new FollowCameraRig();
    slow.snap(ZERO);
    for (let i = 0; i < 50; i += 1) slow.update(ZERO, { x: 3.2, y: 0, z: 0 }, 0, 0.1);
    expect(slow.pose.lookAt.x).toBeCloseTo(0.8 - 0.35, 4);
  });

  it('focus height follows with no deadzone', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    rig.update({ x: 0, y: 0.1, z: 0 }, ZERO, 0, 0.1);
    expect(rig.pose.lookAt.y).toBeCloseTo(1 + 0.1 * (1 - Math.exp(-7.5 * 0.1)), 10);
  });

  it('yaw input clamps at plus and minus yawRange', () => {
    const right = new FollowCameraRig();
    right.snap(ZERO);
    for (let i = 0; i < 10; i += 1) right.update(ZERO, ZERO, 1, 0.1);
    expect(right.pose.yaw).toBeCloseTo(55 * DEG, 10);
    expect(right.forwardYaw).toBeCloseTo(55 * DEG, 10);

    const left = new FollowCameraRig();
    left.snap(ZERO);
    for (let i = 0; i < 10; i += 1) left.update(ZERO, ZERO, -1, 0.1);
    expect(left.pose.yaw).toBeCloseTo(-55 * DEG, 10);
  });

  it('yaw eases home only after yawHomeDelay of no input', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    rig.update(ZERO, ZERO, 1, 0.25); // offset 0.4, idle timer reset
    for (let i = 0; i < 10; i += 1) rig.update(ZERO, ZERO, 0, 0.25);
    expect(rig.pose.yaw).toBeCloseTo(0.4, 10); // 2.5 s is not yet past the delay
    rig.update(ZERO, ZERO, 0, 0.25);
    expect(rig.pose.yaw).toBeCloseTo(0.4 * Math.exp(-2.0 * 0.25), 10);
  });

  it('setHomeYaw eases toward its target instead of snapping', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    rig.setHomeYaw(1.0);
    rig.update(ZERO, ZERO, 0, 0.1);
    expect(rig.pose.yaw).toBeCloseTo(1 * (1 - Math.exp(-1.5 * 0.1)), 10);
    for (let i = 0; i < 100; i += 1) rig.update(ZERO, ZERO, 0, 0.1);
    expect(rig.pose.yaw).toBeCloseTo(1.0, 6);
  });

  it('a probe at 0.5 pulls in quickly and a clear path relaxes slowly', () => {
    const probe = new FakeProbe();
    const rig = new FollowCameraRig({ probe });
    rig.snap(ZERO);

    probe.fraction = 0.5;
    rig.update(ZERO, ZERO, 0, 0.1);
    const pulled = rig.pose.distance;
    expect(pulled).toBeCloseTo(11 - 5.5 * (1 - Math.exp(-12.5 * 0.1)), 6);

    probe.fraction = 1;
    rig.update(ZERO, ZERO, 0, 0.1);
    const pushed = rig.pose.distance;
    expect(pushed).toBeCloseTo(pulled + (11 - pulled) * (1 - Math.exp(-1.67 * 0.1)), 6);
    expect(11 - pulled).toBeGreaterThan(pushed - pulled); // pull-in is faster than push-out
  });

  it('distance never goes below minDistance even when the probe returns 0', () => {
    const probe = new FakeProbe();
    probe.fraction = 0;
    const rig = new FollowCameraRig({ probe });
    rig.snap(ZERO);
    for (let i = 0; i < 100; i += 1) {
      rig.update(ZERO, ZERO, 0, 0.1);
      expect(rig.pose.distance).toBeGreaterThanOrEqual(3.5);
    }
    expect(rig.pose.distance).toBeCloseTo(3.5, 6);
  });

  it('the probe is swept from lookAt to the position at full distance', () => {
    const probe = new FakeProbe();
    const rig = new FollowCameraRig({ probe });
    rig.snap(ZERO);
    rig.update(ZERO, ZERO, 0, 0.1);
    const last = probe.last;
    if (!last) throw new Error('the probe was never called');
    expect(last.from).toEqual({ x: 0, y: 1, z: 0 });
    expect(last.to.x).toBeCloseTo(0, 10);
    expect(last.to.y).toBeCloseTo(1 + Math.sin(PITCH) * 11, 10);
    expect(last.to.z).toBeCloseTo(-Math.cos(PITCH) * 11, 10);
    expect(last.radius).toBe(0.3);
  });

  it('reuses the pose objects between updates', () => {
    const rig = new FollowCameraRig();
    rig.snap(ZERO);
    const first = rig.update(ZERO, { x: 4, y: 0, z: 0 }, 0.5, 0.1);
    const second = rig.update({ x: 1, y: 0, z: 1 }, { x: 4, y: 0, z: 0 }, 0.5, 0.1);
    expect(second).toBe(first);
    expect(second).toBe(rig.pose);
    expect(second.position).toBe(first.position);
    expect(second.lookAt).toBe(first.lookAt);
  });

  it('rejects options out of range', () => {
    expect(() => new FollowCameraRig({ distance: 0 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ distance: -2 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ distance: Number.NaN })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ minDistance: 12, distance: 11 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ pitch: 0 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ pitch: Math.PI / 2 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ pitch: -0.2 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ pitch: Infinity })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ followRate: Number.NaN })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ pullInRate: -1 })).toThrow(RangeError);
    expect(() => new FollowCameraRig({ probeRadius: 0 })).toThrow(RangeError);
    expect(() => new FollowCameraRig()).not.toThrow();
    expect(() => new FollowCameraRig({ distance: 8, minDistance: 3, pitch: 30 * DEG })).not.toThrow();
  });
});

describe('screenToWorld', () => {
  const yaws = [0, 0.4, -1.1, 2.2, Math.PI, -Math.PI, 3.9];

  it('matches the fixed cases at yaw 0', () => {
    expect(screenToWorld(0, -1, 0).x).toBeCloseTo(0, 10);
    expect(screenToWorld(0, -1, 0).z).toBeCloseTo(1, 10);
    expect(screenToWorld(1, 0, 0).x).toBeCloseTo(-1, 10);
    expect(screenToWorld(1, 0, 0).z).toBeCloseTo(0, 10);
  });

  it('gives orthonormal axes for several yaws', () => {
    for (const yaw of yaws) {
      const up = screenToWorld(0, -1, yaw);
      const right = screenToWorld(1, 0, yaw);
      expect(Math.hypot(up.x, up.z)).toBeCloseTo(1, 10);
      expect(Math.hypot(right.x, right.z)).toBeCloseTo(1, 10);
      expect(up.x * right.x + up.z * right.z).toBeCloseTo(0, 10);
      expect(up.x * right.z - up.z * right.x).toBeCloseTo(1, 10);
    }
  });

  it('scales the stick without rotating it', () => {
    const yaw = 0.5;
    const got = screenToWorld(0.5, -0.5, yaw);
    const up = screenToWorld(0, -1, yaw);
    const right = screenToWorld(1, 0, yaw);
    expect(got.x).toBeCloseTo(0.5 * (right.x + up.x), 10);
    expect(got.z).toBeCloseTo(0.5 * (right.z + up.z), 10);
  });
});

describe('applyRig', () => {
  it('creates the game camera with the fixed settings', () => {
    const camera = createGameCamera(16 / 9);
    expect(camera.fov).toBe(32);
    expect(camera.near).toBe(0.3);
    expect(camera.far).toBe(400);
    expect(camera.aspect).toBeCloseTo(16 / 9, 10);
  });

  it('moves the camera to the pose and turns it toward lookAt', () => {
    const camera = createGameCamera(1);
    const rig = new FollowCameraRig();
    rig.snap({ x: 2, y: 0, z: 3 });
    applyPose(camera, rig.pose);

    expect(camera.position.x).toBeCloseTo(rig.pose.position.x, 10);
    expect(camera.position.y).toBeCloseTo(rig.pose.position.y, 10);
    expect(camera.position.z).toBeCloseTo(rig.pose.position.z, 10);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const want = new THREE.Vector3(
      rig.pose.lookAt.x - rig.pose.position.x,
      rig.pose.lookAt.y - rig.pose.position.y,
      rig.pose.lookAt.z - rig.pose.position.z,
    ).normalize();
    expect(forward.dot(want)).toBeCloseTo(1, 10);
  });

  it('tilt and zoom move the camera within their limits and stay put with holdView', () => {
    const rig = new FollowCameraRig({ holdView: true });
    rig.snap(ZERO);
    for (let i = 0; i < 600; i++) rig.update(ZERO, ZERO, 0, 1 / 60, 1, 1);
    const height = (pose: { position: Vec3; lookAt: Vec3 }) => pose.position.y - pose.lookAt.y;
    expect(rig.pose.distance).toBeCloseTo(6, 3); // zoomed all the way in
    expect(height(rig.pose)).toBeCloseTo(Math.sin(65 * DEG) * 6, 2);

    for (let i = 0; i < 600; i++) rig.update(ZERO, ZERO, 0, 1 / 60, -1, -1);
    expect(rig.pose.distance).toBeCloseTo(18, 1);
    expect(height(rig.pose)).toBeCloseTo(Math.sin(14 * DEG) * rig.pose.distance, 2);

    // Idle for a long time: a held view does not drift home.
    for (let i = 0; i < 600; i++) rig.update(ZERO, ZERO, 1, 1 / 60);
    const yaw = rig.pose.yaw;
    for (let i = 0; i < 600; i++) rig.update(ZERO, ZERO, 0, 1 / 60);
    expect(rig.pose.yaw).toBeCloseTo(yaw, 10);
    expect(rig.pose.distance).toBeCloseTo(18, 1);
  });

  it('resetView eases yaw, tilt and zoom back to the home view', () => {
    const rig = new FollowCameraRig({ holdView: true, homeYaw: 0.4 });
    rig.snap(ZERO);
    for (let i = 0; i < 120; i++) rig.update(ZERO, ZERO, 1, 1 / 60, 1, 1);
    rig.resetView();
    for (let i = 0; i < 900; i++) rig.update(ZERO, ZERO, 0, 1 / 60);
    expect(rig.pose.yaw).toBeCloseTo(0.4, 3);
    expect(rig.pose.distance).toBeCloseTo(11, 2);
    expect(rig.pose.position.y - rig.pose.lookAt.y).toBeCloseTo(Math.sin(PITCH) * 11, 2);
  });

  it('a full yaw range orbits all the way round, and the tilt can go below the horizon', () => {
    const rig = new FollowCameraRig({ holdView: true, yawRange: Math.PI, pitchMin: -12 * DEG });
    rig.snap(ZERO);
    let turned = 0;
    let last = rig.pose.yaw;
    for (let i = 0; i < 600; i++) {
      rig.update(ZERO, ZERO, 1, 1 / 60);
      let step = rig.pose.yaw - last;
      if (step < -Math.PI) step += 2 * Math.PI;
      turned += step;
      last = rig.pose.yaw;
    }
    expect(turned).toBeGreaterThan(2 * Math.PI); // never stopped at a limit

    for (let i = 0; i < 600; i++) rig.update(ZERO, ZERO, 0, 1 / 60, -1);
    expect(rig.pose.position.y).toBeLessThan(rig.pose.lookAt.y); // looking up at him
  });
});
