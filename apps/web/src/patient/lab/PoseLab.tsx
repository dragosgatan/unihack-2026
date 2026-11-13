import { useEffect, useRef, useState } from 'react';
import { DrawingUtils, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { jointAngle } from '@tempo/shared/scoring';
import { startPoseTracking, type Delegate } from '../pose/tracker.ts';

const MIN_VISIBILITY = 0.5;

function shoulderAngle(landmarks: NormalizedLandmark[], width: number, height: number, shoulder: number, elbow: number, hip: number) {
  const h = landmarks[hip];
  const s = landmarks[shoulder];
  const e = landmarks[elbow];
  if (!h || !s || !e || [h, s, e].some((p) => p.visibility < MIN_VISIBILITY)) return undefined;
  const px = (p: NormalizedLandmark) => ({ x: p.x * width, y: p.y * height });
  return Math.round(jointAngle(px(h), px(s), px(e)));
}

function describeError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error instanceof Event) return 'Could not load the pose runtime.';
  return String(error);
}

export function PoseLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [delegate, setDelegate] = useState<Delegate | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [left, setLeft] = useState<number | undefined>();
  const [right, setRight] = useState<number | undefined>();
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setLeft(undefined);
    setRight(undefined);
    setRunning(false);
  };

  const start = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const drawing = new DrawingUtils(context);
    let frames = 0;
    let windowStart = performance.now();

    const fail = (reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(describeError(reason));
      stop();
    };

    const onFrame = (landmarks: NormalizedLandmark[] | undefined) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      if (landmarks) {
        drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#22d3ee', lineWidth: 4 });
        drawing.drawLandmarks(landmarks, { color: '#f472b6', radius: 4 });
      }
      setLeft(landmarks && shoulderAngle(landmarks, width, height, 11, 13, 23));
      setRight(landmarks && shoulderAngle(landmarks, width, height, 12, 14, 24));
      frames += 1;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
    };

    setError(undefined);
    setDelegate(undefined);
    setFps(0);
    setRunning(true);
    startPoseTracking({ video, signal: controller.signal, onFrame, onError: fail, onStatus: setStatus }).then(setDelegate, fail);
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6 text-[20pt]">
      <h1 className="text-[28pt] font-bold">Pose lab</h1>
      <div className="relative overflow-hidden rounded-2xl bg-black">
        {/* iOS Safari goes fullscreen or refuses to play camera video without playsInline and muted. */}
        <video ref={videoRef} className="block h-auto w-full -scale-x-100" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
      </div>
      {running ? (
        <button type="button" className="min-h-[60pt] rounded-2xl bg-red-600 px-6 text-[24pt] font-semibold text-white" onClick={stop}>
          Stop
        </button>
      ) : (
        <button type="button" className="min-h-[60pt] rounded-2xl bg-blue-600 px-6 text-[24pt] font-semibold text-white" onClick={start}>
          Start camera
        </button>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        <dt>Left shoulder</dt>
        <dd className="font-mono">{left === undefined ? '–' : `${left}°`}</dd>
        <dt>Right shoulder</dt>
        <dd className="font-mono">{right === undefined ? '–' : `${right}°`}</dd>
        <dt>Inference</dt>
        <dd className="font-mono">{fps} fps</dd>
        <dt>Delegate</dt>
        <dd className="font-mono">{delegate ?? (running ? status : '–')}</dd>
      </dl>
    </main>
  );
}
