import { motion, useReducedMotion } from 'motion/react';
import type { Side } from '@tempo/shared';

type Point = [number, number];
type Pose = Record<'head' | 'neck' | 'pelvis' | 'ls' | 'rs' | 'lh' | 'rh' | 'lhand' | 'rhand' | 'lk' | 'rk' | 'lf' | 'rf', Point>;
export type DemoName = 'shoulder-raise' | 'sit-to-stand' | 'single-leg-squat';

const standing: Pose = {
  head: [50, 14],
  neck: [50, 26],
  pelvis: [50, 60],
  ls: [40, 26],
  rs: [60, 26],
  lh: [44, 60],
  rh: [56, 60],
  lhand: [38, 58],
  rhand: [62, 58],
  lk: [44, 85],
  rk: [56, 85],
  lf: [44, 110],
  rf: [56, 110],
};

const lower = (pose: Pose, dy: number, keep: (keyof Pose)[]): Pose =>
  Object.fromEntries(
    Object.entries(pose).map(([name, [x, y]]) => [name, keep.includes(name as keyof Pose) ? [x, y] : [x, y + dy]]),
  ) as Pose;

const armsCrossed = (pose: Pose): Pose => ({ ...pose, lhand: [57, pose.ls[1] + 10], rhand: [43, pose.rs[1] + 10] });

const seated: Pose = armsCrossed({
  ...lower(standing, 18, ['lk', 'rk', 'lf', 'rf']),
  lk: [42, 82],
  rk: [58, 82],
});

const oneLeg: Pose = { ...standing, lk: [42, 78], lf: [36, 94] };

const demos: Record<DemoName, [Pose, Pose]> = {
  'shoulder-raise': [standing, { ...standing, rhand: [86, 8] }],
  'sit-to-stand': [seated, armsCrossed(standing)],
  'single-leg-squat': [oneLeg, { ...lower(oneLeg, 12, ['rf']), rk: [55, 90] }],
};

const mirror = (pose: Pose): Pose => ({
  head: pose.head,
  neck: pose.neck,
  pelvis: pose.pelvis,
  ls: flip(pose.rs),
  rs: flip(pose.ls),
  lh: flip(pose.rh),
  rh: flip(pose.lh),
  lhand: flip(pose.rhand),
  rhand: flip(pose.lhand),
  lk: flip(pose.rk),
  rk: flip(pose.lk),
  lf: flip(pose.rf),
  rf: flip(pose.lf),
});

const flip = ([x, y]: Point): Point => [100 - x, y];

const bones: [keyof Pose, keyof Pose][] = [
  ['ls', 'rs'],
  ['neck', 'pelvis'],
  ['lh', 'rh'],
  ['ls', 'lhand'],
  ['rs', 'rhand'],
  ['lh', 'lk'],
  ['lk', 'lf'],
  ['rh', 'rk'],
  ['rk', 'rf'],
];

export function Demo({ name, side = 'right', className = '' }: { name: DemoName; side?: Side; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [rest, moved] = demos[name].map((pose) => (side === 'left' ? mirror(pose) : pose)) as [Pose, Pose];
  const transition = { duration: 3, ease: 'easeInOut', repeat: Infinity } as const;
  const start = reduceMotion ? moved : rest;
  const between = (pick: (pose: Pose) => number) => (reduceMotion ? pick(moved) : [pick(rest), pick(moved), pick(rest)]);

  return (
    <svg viewBox="0 0 100 120" className={`text-blue-600 ${className}`} aria-hidden="true">
      <motion.circle
        r={8}
        cx={start.head[0]}
        cy={start.head[1]}
        className="fill-current"
        animate={{ cx: between((pose) => pose.head[0]), cy: between((pose) => pose.head[1]) }}
        transition={transition}
      />
      {bones.map(([from, to]) => (
        <motion.line
          key={`${from}-${to}`}
          className="stroke-current"
          strokeWidth={5}
          strokeLinecap="round"
          x1={start[from][0]}
          y1={start[from][1]}
          x2={start[to][0]}
          y2={start[to][1]}
          animate={{
            x1: between((pose) => pose[from][0]),
            y1: between((pose) => pose[from][1]),
            x2: between((pose) => pose[to][0]),
            y2: between((pose) => pose[to][1]),
          }}
          transition={transition}
        />
      ))}
    </svg>
  );
}
