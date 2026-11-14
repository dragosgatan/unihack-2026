import type { TrailMakingTarget } from '@tempo/shared';

const jitter = 0.12;

export const trailLayout = (labels: string[], random = Math.random): TrailMakingTarget[] => {
  const columns = labels.length > 4 ? 3 : 2;
  const rows = Math.ceil(labels.length / columns);
  const cells = Array.from({ length: columns * rows }, (_, cell) => ({ cell, key: random() })).sort(
    (a, b) => a.key - b.key,
  );
  const offset = () => 0.5 + (random() * 2 - 1) * jitter;
  return labels.map((label, index) => {
    const cell = cells[index]?.cell ?? index;
    return { label, x: ((cell % columns) + offset()) / columns, y: (Math.floor(cell / columns) + offset()) / rows };
  });
};
