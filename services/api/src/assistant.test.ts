import { describe, expect, it } from 'vitest';
import { runningActivityActionIds } from '@tempo/shared';
import { filterAssistantCalls, safeReply } from './assistant.ts';

describe('filterAssistantCalls', () => {
  it('keeps only the three running-activity actions while a test runs', () => {
    const calls = [
      { id: 'navigate', params: { screenId: 'patient.home' } },
      { id: 'answerCheckIn', params: { item: 'pain', intensity: 4 } },
      { id: 'openPatient', params: { spokenName: 'Elena' } },
      { id: 'cannotDo', params: {} },
    ];
    const { kept, dropped } = filterAssistantCalls(calls, 'patient', runningActivityActionIds);
    expect(kept).toEqual([{ id: 'cannotDo', params: {} }]);
    expect(dropped).toEqual([
      { id: 'navigate', reason: 'unavailable' },
      { id: 'answerCheckIn', reason: 'unavailable' },
      { id: 'openPatient', reason: 'role' },
    ]);
  });

  it('never gives a patient a clinician action, even when the screen lists it', () => {
    const calls = [
      { id: 'openPatient', params: { spokenName: 'Elena' } },
      { id: 'openMetric', params: { metricId: 'pain.intensity' } },
      { id: 'askRecord', params: { question: 'How was she?' } },
    ];
    const { kept, dropped } = filterAssistantCalls(calls, 'patient', ['openPatient', 'openMetric', 'askRecord']);
    expect(kept).toEqual([]);
    expect(dropped.map((call) => call.reason)).toEqual(['role', 'role', 'role']);
  });

  it('keeps clinician actions out of an admin’s hands and patient actions out of a clinician’s', () => {
    expect(filterAssistantCalls([{ id: 'askRecord', params: { question: 'q' } }], 'admin', ['askRecord']).dropped).toEqual([
      { id: 'askRecord', reason: 'role' },
    ]);
    expect(filterAssistantCalls([{ id: 'cannotDo', params: {} }], 'therapist', ['cannotDo']).dropped).toEqual([
      { id: 'cannotDo', reason: 'role' },
    ]);
  });

  it('drops unregistered calls first, then invalid params, and parses what it keeps', () => {
    const calls = [
      { id: 'clickElement', params: { selector: '#sign-off' } },
      { id: 'acceptSuggestion', params: {} },
      { id: 'answerCheckIn', params: { item: 'pain', intensity: 14 } },
      { id: 'cannotDo', params: { reason: 'pain' } },
      { id: 'answerCheckIn', params: { item: 'pain', intensity: 6, location: 'left-knee' } },
    ];
    const { kept, dropped } = filterAssistantCalls(calls, 'patient', ['answerCheckIn', 'cannotDo']);
    expect(dropped).toEqual([
      { id: 'clickElement', reason: 'unregistered' },
      { id: 'acceptSuggestion', reason: 'unregistered' },
      { id: 'answerCheckIn', reason: 'invalid-params' },
      { id: 'cannotDo', reason: 'invalid-params' },
    ]);
    expect(kept).toEqual([{ id: 'answerCheckIn', params: { item: 'pain', intensity: 6, location: 'left-knee' } }]);
  });
});

describe('safeReply', () => {
  it('replaces the reply only when everything was dropped', () => {
    const none = { kept: [], dropped: [] };
    const allDropped = { kept: [], dropped: [{ id: 'navigate', reason: 'role' as const }] };
    const someKept = { kept: [{ id: 'goBack' as const, params: {} }], dropped: allDropped.dropped };
    expect(safeReply('Done.', 'en', none)).toBe('Done.');
    expect(safeReply('Opening it.', 'en', allDropped)).toBe("I can't do that here.");
    expect(safeReply('Îl deschid.', 'ro', allDropped)).toBe('Nu pot face asta aici.');
    expect(safeReply('Going back.', 'en', someKept)).toBe('Going back.');
  });
});
