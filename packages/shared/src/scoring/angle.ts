export interface Point2D {
  x: number;
  y: number;
}

export function jointAngle(a: Point2D, vertex: Point2D, c: Point2D): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const cx = c.x - vertex.x;
  const cy = c.y - vertex.y;
  return (Math.abs(Math.atan2(ax * cy - ay * cx, ax * cx + ay * cy)) * 180) / Math.PI;
}
