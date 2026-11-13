import { useEffect } from 'react';
import type { Language } from '@tempo/shared';

export const voices: Record<Language, string> = { en: 'en-GB', ro: 'ro-RO' };
const hasSpeech = () => typeof speechSynthesis !== 'undefined';

let audio: AudioContext | undefined;
let speechUnlocked = false;

export function speak(text: string, language: Language) {
  if (!hasSpeech()) return;
  speechSynthesis.cancel();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voices[language];
  speechSynthesis.speak(utterance);
}

export function useSpoken(text: string, language: Language) {
  useEffect(() => {
    speak(text, language);
    return () => {
      if (hasSpeech()) speechSynthesis.cancel();
    };
  }, [text, language]);
}

export function tapFeedback() {
  // iOS Safari only lets speech play without a tap once one utterance has started inside a tap.
  if (!speechUnlocked && hasSpeech()) {
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    speechUnlocked = true;
  }
  if (typeof AudioContext === 'undefined') return;
  audio ??= new AudioContext();
  void audio.resume();
  const end = audio.currentTime + 0.08;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.frequency.value = 660;
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  tone.connect(gain).connect(audio.destination);
  tone.start();
  tone.stop(end);
}
