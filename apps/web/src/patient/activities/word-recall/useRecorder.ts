import { useEffect, useRef } from 'react';
import type { WordRecallRecording } from '@tempo/shared';
import { saveRecording } from '../../session/store.ts';

const maxRecordingMs = 30_000;
const audioBitsPerSecond = 32_000;
const preferredTypes = ['audio/webm;codecs=opus', 'audio/mp4'];

export type RecordingStarted = Pick<WordRecallRecording, 'id' | 'mimeType'>;
type Live = { recorder: MediaRecorder; timer: ReturnType<typeof setTimeout> };

export function useRecorder() {
  const live = useRef<Live>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (live.current?.recorder.state === 'recording') live.current.recorder.stop();
    };
  }, []);

  const start = async (keep: boolean, onStop: (recording: WordRecallRecording) => void): Promise<RecordingStarted | undefined> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const release = () => stream.getTracks().forEach((track) => track.stop());
    if (!mounted.current) {
      release();
      return undefined;
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? '',
      audioBitsPerSecond,
    });
    const id = crypto.randomUUID();
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      clearTimeout(timer);
      release();
      if (live.current?.recorder === recorder) live.current = undefined;
      const audio = new Blob(chunks, { type: recorder.mimeType });
      if (keep) saveRecording(id, audio).catch(console.error);
      if (mounted.current) {
        onStop({ id, mimeType: recorder.mimeType, durationMs: Math.round(performance.now() - startedAt), bytes: audio.size });
      }
    };
    const timer = setTimeout(() => recorder.stop(), maxRecordingMs);
    live.current = { recorder, timer };
    recorder.start();
    return { id, mimeType: recorder.mimeType };
  };

  const stop = () => {
    if (live.current?.recorder.state === 'recording') live.current.recorder.stop();
  };

  return { start, stop };
}
