import { crc32, deflateSync } from 'node:zlib';
import type { ClockDrawingPoint } from '@tempo/shared';

const white = 255;
const black = 0;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const uint32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([uint32(data.length), body, uint32(crc32(body))]);
};

const grayscalePng = (pixels: Uint8Array, size: number): Uint8Array => {
  const rows = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    rows.set(pixels.subarray(y * size, (y + 1) * size), y * (size + 1) + 1);
  }
  const header = Buffer.concat([uint32(size), uint32(size), Buffer.from([8, 0, 0, 0, 0])]);
  return Buffer.concat([pngSignature, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array())]);
};

type Pixel = { x: number; y: number };

const squaredDistanceToSegment = (p: Pixel, a: Pixel, b: Pixel): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  const nearestX = a.x + along * dx;
  const nearestY = a.y + along * dy;
  return (p.x - nearestX) ** 2 + (p.y - nearestY) ** 2;
};

const drawSegment = (pixels: Uint8Array, size: number, a: Pixel, b: Pixel, radius: number): void => {
  const from = (low: number) => Math.max(0, Math.floor(low - radius));
  const to = (high: number) => Math.min(size - 1, Math.ceil(high + radius));
  for (let y = from(Math.min(a.y, b.y)); y <= to(Math.max(a.y, b.y)); y++) {
    for (let x = from(Math.min(a.x, b.x)); x <= to(Math.max(a.x, b.x)); x++) {
      if (squaredDistanceToSegment({ x: x + 0.5, y: y + 0.5 }, a, b) <= radius * radius) pixels[y * size + x] = black;
    }
  }
};

export const clockDrawingPng = (strokes: ClockDrawingPoint[][], size = 512): Uint8Array => {
  const pixels = new Uint8Array(size * size).fill(white);
  const radius = Math.max(1, size / 200);
  for (const stroke of strokes) {
    const points = stroke.map(({ x, y }) => ({ x: x * size, y: y * size }));
    points.forEach((point, index) => drawSegment(pixels, size, points[index - 1] ?? point, point, radius));
  }
  return grayscalePng(pixels, size);
};
