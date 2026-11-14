import { PoseLandmarker, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { modelAssetPath, wasmBinaryUrl, wasmLoaderPath } from './assets.ts';

export type Delegate = 'GPU' | 'CPU';

export interface PoseTracking {
  video: HTMLVideoElement;
  signal: AbortSignal;
  onFrame: (landmarks: NormalizedLandmark[] | undefined, world: Landmark[] | undefined) => void;
  onError: (error: unknown) => void;
  onStatus: OnStatus;
}

const GPU_START_TIMEOUT_MS = 15_000;
const MIN_FULL_RATE_FPS = 12;

type OnStatus = (status: string) => void;

async function download(url: string, label: string, totalMb: number, type: string, onStatus: OnStatus, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onStatus(`downloading ${label}: ${(received / 1e6).toFixed(1)} of ${totalMb} MB`);
  }
  return new Blob(chunks, { type });
}

interface Assets {
  wasmBinaryPath: string;
  model: Uint8Array;
}

function createLandmarker(delegate: Delegate, { wasmBinaryPath, model: modelAssetBuffer }: Assets) {
  return PoseLandmarker.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
    baseOptions: { modelAssetBuffer, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

async function createWithCpuFallback(assets: Assets, onStatus: OnStatus) {
  onStatus('starting on GPU');
  const gpu = createLandmarker('GPU', assets);
  const started = await Promise.race([
    gpu.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(resolve, GPU_START_TIMEOUT_MS)),
  ]);
  if (started) return { landmarker: started, delegate: 'GPU' as const };
  gpu.then((late) => late.close(), () => undefined);
  onStatus('starting on CPU');
  return { landmarker: await createLandmarker('CPU', assets), delegate: 'CPU' as const };
}

export async function startPoseTracking({ video, signal, onFrame, onError, onStatus }: PoseTracking): Promise<Delegate> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available. The page must be opened over HTTPS.');
  onStatus('waiting for camera');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });

  let landmarker: PoseLandmarker | undefined;
  let frameRequest = 0;
  const useVideoFrameCallback = 'requestVideoFrameCallback' in video;

  const stop = () => {
    if (useVideoFrameCallback) video.cancelVideoFrameCallback(frameRequest);
    else cancelAnimationFrame(frameRequest);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    landmarker?.close();
    landmarker = undefined;
  };

  if (signal.aborted) {
    stop();
    throw signal.reason;
  }
  signal.addEventListener('abort', stop, { once: true });

  let delegate: Delegate = 'GPU';
  try {
    onStatus('starting video');
    video.srcObject = stream;
    await video.play();
    const wasm = await download(wasmBinaryUrl, 'runtime', 11.2, 'application/wasm', onStatus, signal);
    const model = await download(modelAssetPath, 'model', 5.8, 'application/octet-stream', onStatus, signal);
    const wasmBinaryPath = URL.createObjectURL(wasm);
    const assets = { wasmBinaryPath, model: new Uint8Array(await model.arrayBuffer()) };
    const { landmarker: created, delegate: used } = await createWithCpuFallback(assets, onStatus).finally(() =>
      URL.revokeObjectURL(wasmBinaryPath),
    );
    delegate = used;
    if (signal.aborted) {
      created.close();
      throw signal.reason;
    }
    landmarker = created;
  } catch (error) {
    stop();
    throw error;
  }

  let lastVideoTime = -1;
  let lastTimestamp = 0;
  let videoFrames = 0;
  let stride = 1;
  let detected = 0;
  let windowStart: number | undefined;
  const tick = () => {
    if (!landmarker) return;
    try {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        videoFrames += 1;
        if (videoFrames % stride === 0) {
          lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);
          landmarker.detectForVideo(video, lastTimestamp, (result) => onFrame(result.landmarks[0], result.worldLandmarks[0]));
          detected += 1;
        }
        const now = performance.now();
        // The first detection compiles GPU shaders, so the rate is measured from the frame after it.
        if (windowStart === undefined || now - windowStart >= 1000) {
          if (windowStart !== undefined && (detected * 1000) / (now - windowStart) < MIN_FULL_RATE_FPS) stride = 2;
          detected = 0;
          windowStart = now;
        }
      }
    } catch (error) {
      stop();
      onError(error);
      return;
    }
    frameRequest = useVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  tick();

  return delegate;
}
