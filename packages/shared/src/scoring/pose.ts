import type { Side } from '../common.ts';
import { jointAngle, type Point2D } from './angle.ts';

export type Point3D = Point2D & { z: number };
export type Landmark = Point3D & { visibility?: number };
export type Pose = readonly Landmark[];

export const poseLandmarks = {
  left: { shoulder: 11, elbow: 13, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, hip: 24, knee: 26, ankle: 28 },
} as const;

type Joint = keyof typeof poseLandmarks.left;

const minVisibility = 0.5;
const toDegrees = 180 / Math.PI;

const sub = (a: Point3D, b: Point3D): Point3D => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Point3D): number => Math.hypot(v.x, v.y, v.z);
const midpoint = (a: Point3D, b: Point3D): Point3D => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

export const vectorAngle = (u: Point3D, v: Point3D): number => {
  const lengths = length(u) * length(v);
  if (lengths === 0) return 0;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / lengths;
  return Math.acos(Math.min(1, Math.max(-1, cos))) * toDegrees;
};

export const jointAngle3d = (a: Point3D, vertex: Point3D, c: Point3D): number =>
  vectorAngle(sub(a, vertex), sub(c, vertex));

const joint = (pose: Pose, side: Side, name: Joint): Landmark | undefined => {
  const landmark = pose[poseLandmarks[side][name]];
  return landmark && (landmark.visibility ?? 1) >= minVisibility ? landmark : undefined;
};

const trunk = (pose: Pose) => {
  const ls = joint(pose, 'left', 'shoulder');
  const rs = joint(pose, 'right', 'shoulder');
  const lh = joint(pose, 'left', 'hip');
  const rh = joint(pose, 'right', 'hip');
  if (!ls || !rs || !lh || !rh) return undefined;
  const hips = midpoint(lh, rh);
  const shoulders = midpoint(ls, rs);
  return { hips, shoulders, down: sub(hips, shoulders) };
};

export const shoulderElevation = (pose: Pose, side: Side): number | undefined => {
  const body = trunk(pose);
  const shoulder = joint(pose, side, 'shoulder');
  const elbow = joint(pose, side, 'elbow');
  if (!body || !shoulder || !elbow) return undefined;
  return vectorAngle(body.down, sub(elbow, shoulder));
};

const leg = (pose: Pose, side: Side) => {
  const hip = joint(pose, side, 'hip');
  const knee = joint(pose, side, 'knee');
  const ankle = joint(pose, side, 'ankle');
  return hip && knee && ankle ? { hip, knee, ankle } : undefined;
};

export const kneeFlexion = (pose: Pose, side: Side): number | undefined => {
  const l = leg(pose, side);
  return l && 180 - jointAngle3d(l.hip, l.knee, l.ankle);
};

export const squatDepth = (pose: Pose, side: Side): number | undefined => {
  const l = leg(pose, side);
  if (!l) return undefined;
  const legLength = length(sub(l.knee, l.hip)) + length(sub(l.ankle, l.knee));
  if (legLength === 0) return undefined;
  return Math.min(100, Math.max(0, (1 - (l.ankle.y - l.hip.y) / legLength) * 100));
};

export const kneeValgus = (pose: Pose, side: Side): number | undefined => {
  const l = leg(pose, side);
  const body = trunk(pose);
  if (!l || !body || l.ankle.y === l.hip.y) return undefined;
  const lineX = l.hip.x + ((l.ankle.x - l.hip.x) * (l.knee.y - l.hip.y)) / (l.ankle.y - l.hip.y);
  const inward = Math.abs(l.knee.x - body.hips.x) < Math.abs(lineX - body.hips.x);
  return inward ? 180 - jointAngle(l.hip, l.knee, l.ankle) : 0;
};

export const standingHeight = (pose: Pose): number | undefined => {
  const body = trunk(pose);
  if (!body) return undefined;
  const torso = length(body.down);
  const knees = (['left', 'right'] as const).flatMap((side) => joint(pose, side, 'knee') ?? []);
  if (torso === 0 || knees.length === 0) return undefined;
  return knees.reduce((sum, knee) => sum + knee.y - body.hips.y, 0) / knees.length / torso;
};
