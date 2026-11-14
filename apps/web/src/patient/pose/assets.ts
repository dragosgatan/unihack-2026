import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import modelAssetPath from './pose_landmarker_lite.task?url';

export { modelAssetPath, wasmBinaryUrl, wasmLoaderPath };

export const poseCacheName = 'pose-assets';
const poseAssetUrls = [wasmLoaderPath, wasmBinaryUrl, modelAssetPath];

export async function warmPoseAssets(urls = poseAssetUrls) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(poseCacheName);
  const wanted = new Set(urls.map((url) => new URL(url, location.href).href));
  for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request);
  const missing = [];
  for (const url of wanted) if (!(await cache.match(url))) missing.push(url);
  await cache.addAll(missing);
}

export const warmPoseAssetsInBackground = () => void warmPoseAssets().catch(console.warn);
