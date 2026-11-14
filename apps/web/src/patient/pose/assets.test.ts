import { afterEach, describe, expect, it, vi } from 'vitest';
import { poseCacheName, warmPoseAssets } from './assets.ts';

const fakeCache = (stored: string[]) => {
  const urls = new Set(stored.map((url) => new URL(url, location.href).href));
  return {
    urls,
    keys: async () => [...urls].map((url) => new Request(url)),
    match: async (url: string) => (urls.has(url) ? new Response() : undefined),
    delete: async (request: Request) => urls.delete(request.url),
    addAll: vi.fn(async (added: string[]) => added.forEach((url) => urls.add(url))),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('warmPoseAssets', () => {
  it('downloads only the missing pose files and drops ones from an older build', async () => {
    const cache = fakeCache(['/assets/vision_wasm_internal-new.js', '/assets/pose_landmarker_lite-old.task']);
    const open = vi.fn(async () => cache);
    vi.stubGlobal('caches', { open });

    await warmPoseAssets(['/assets/vision_wasm_internal-new.js', '/assets/vision_wasm_internal-new.wasm', '/assets/pose_landmarker_lite-new.task']);

    expect(open).toHaveBeenCalledWith(poseCacheName);
    expect(cache.addAll).toHaveBeenCalledWith([
      `${location.origin}/assets/vision_wasm_internal-new.wasm`,
      `${location.origin}/assets/pose_landmarker_lite-new.task`,
    ]);
    expect([...cache.urls].map((url) => new URL(url).pathname).sort()).toEqual([
      '/assets/pose_landmarker_lite-new.task',
      '/assets/vision_wasm_internal-new.js',
      '/assets/vision_wasm_internal-new.wasm',
    ]);
  });
});
