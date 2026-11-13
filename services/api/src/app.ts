import { Hono } from 'hono';
import type { HealthResponse } from '@tempo/shared';

export const app = new Hono();

app.get('/api/health', (c) => {
  const body: HealthResponse = { status: 'ok', time: new Date().toISOString() };
  return c.json(body);
});
