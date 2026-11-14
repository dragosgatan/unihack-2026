import { describe, expect, it } from 'vitest';
import {
  assistantActionCallSchema,
  assistantActionIds,
  assistantActionIdSchema,
  assistantActions,
  assistantRoleSchema,
  assistantTurnRequestSchema,
  assistantTurnRecordSchema,
  assistantTurnResponseSchema,
  confirmationLevelSchema,
  runningActivityActionIds,
  type AssistantActionId,
} from './assistant.ts';

describe('assistantRoleSchema', () => {
  it('accepts the patient and every staff role', () => {
    for (const role of ['patient', 'admin', 'attending', 'therapist']) {
      expect(assistantRoleSchema.safeParse(role).success).toBe(true);
    }
  });
});

describe('confirmationLevelSchema', () => {
  it('has no human-only level', () => {
    expect(confirmationLevelSchema.safeParse('confirm').success).toBe(true);
    expect(confirmationLevelSchema.safeParse('human-only').success).toBe(false);
  });
});

describe('assistantActionIdSchema', () => {
  it('rejects an action that is not registered', () => {
    expect(assistantActionIdSchema.safeParse('openMetric').success).toBe(true);
    expect(assistantActionIdSchema.safeParse('clickElement').success).toBe(false);
    expect(assistantActionIdSchema.safeParse('signOffReport').success).toBe(false);
  });
});

describe('assistantActions', () => {
  const validParams = {
    navigate: { screenId: 'clinician.patients' },
    goBack: {},
    repeatInstructions: {},
    pauseSession: {},
    cannotDo: {},
    answerCheckIn: { item: 'pain', intensity: 6, location: 'left-knee' },
    logEpisode: { type: 'fall', count: 1, description: 'Slipped in the bathroom this morning' },
    openPatient: { spokenName: 'Elena Dorian' },
    openMetric: { metricId: 'finger-tapping.taps-per-second' },
    askRecord: { question: 'How was her tapping last month?' },
  } satisfies Record<AssistantActionId, unknown>;

  it.each(assistantActionIds)('%s parses its params and allows at least one role', (id) => {
    const action = assistantActions[id];
    expect(action.params.safeParse(validParams[id]).success).toBe(true);
    expect(action.roles.length).toBeGreaterThan(0);
    expect(confirmationLevelSchema.safeParse(action.confirmation).success).toBe(true);
  });

  it('asks for confirmation before anything is saved', () => {
    expect(assistantActions.answerCheckIn.confirmation).toBe('confirm');
    expect(assistantActions.logEpisode.confirmation).toBe('confirm');
  });

  it('gives cannotDo no params, so the patient picks the reason', () => {
    expect(assistantActions.cannotDo.params.safeParse({ reason: 'pain' }).success).toBe(false);
  });

  it('keeps patient records away from admins and patients', () => {
    for (const id of ['openPatient', 'openMetric', 'askRecord'] as const) {
      expect([...assistantActions[id].roles].sort()).toEqual(['attending', 'therapist']);
    }
  });
});

describe('runningActivityActionIds', () => {
  it('is repeat, pause and cannot do, all automatic and open to the patient', () => {
    expect(runningActivityActionIds).toEqual(['repeatInstructions', 'pauseSession', 'cannotDo']);
    for (const id of runningActivityActionIds) {
      expect(assistantActions[id].confirmation).toBe('auto');
      expect(assistantActions[id].roles).toContain('patient');
    }
  });
});

describe('assistantActionCallSchema', () => {
  it('accepts a registered action with valid params', () => {
    const call = { id: 'openPatient', params: { spokenName: 'Elena Dorian' } };
    expect(assistantActionCallSchema.safeParse(call).success).toBe(true);
  });

  it('rejects params that belong to another action', () => {
    const call = { id: 'openMetric', params: { spokenName: 'Elena Dorian' } };
    expect(assistantActionCallSchema.safeParse(call).success).toBe(false);
  });

  it('rejects an unregistered action', () => {
    expect(assistantActionCallSchema.safeParse({ id: 'acceptSuggestion', params: {} }).success).toBe(false);
  });
});

describe('POST /api/assistant/turn', () => {
  const request = {
    audio: { mimeType: 'audio/webm', data: 'UklGRiQAAABXQVZF' },
    language: 'ro',
    screenId: 'patient.check-in.pain',
    availableActionIds: ['answerCheckIn', 'goBack'],
  };

  it('takes one clip, the language, the screen and its actions', () => {
    expect(assistantTurnRequestSchema.safeParse(request).success).toBe(true);
  });

  it('rejects a clip that is not audio or an unknown action id', () => {
    const video = { ...request, audio: { ...request.audio, mimeType: 'video/mp4' } };
    expect(assistantTurnRequestSchema.safeParse(video).success).toBe(false);
    expect(assistantTurnRequestSchema.safeParse({ ...request, availableActionIds: ['clickElement'] }).success).toBe(false);
  });

  it('takes typed text in place of the clip', () => {
    const { audio, ...context } = request;
    const typed = { ...context, text: '  durerea mea este șase  ' };
    const parsed = assistantTurnRequestSchema.parse(typed);
    expect('text' in parsed && parsed.text).toBe('durerea mea este șase');
    expect(assistantTurnRequestSchema.safeParse({ ...typed, audio }).success).toBe(false);
    expect(assistantTurnRequestSchema.safeParse(context).success).toBe(false);
    expect(assistantTurnRequestSchema.safeParse({ ...context, text: '   ' }).success).toBe(false);
    expect(assistantTurnRequestSchema.safeParse({ ...context, text: 'a'.repeat(501) }).success).toBe(false);
  });

  it('returns a transcript, a reply and the actions to run', () => {
    const response = {
      turnId: 'turn-1',
      transcript: 'my pain is six in my left knee',
      reply: 'Pain six, left knee. Shall I save that?',
      actions: [{ id: 'answerCheckIn', params: { item: 'pain', intensity: 6, location: 'left-knee' } }],
      droppedActionIds: [],
    };
    expect(assistantTurnResponseSchema.safeParse(response).success).toBe(true);
  });

  it('returns a reply with no actions when nothing is allowed, and the ids it dropped', () => {
    const response = {
      turnId: 'turn-2',
      transcript: 'do the test for me',
      reply: 'That one is yours to do.',
      actions: [],
      droppedActionIds: ['answerTest'],
    };
    expect(assistantTurnResponseSchema.safeParse(response).success).toBe(true);
    const { droppedActionIds, ...withoutDropped } = response;
    expect(droppedActionIds).toHaveLength(1);
    expect(assistantTurnResponseSchema.safeParse(withoutDropped).success).toBe(false);
  });
});

describe('assistantTurnRecordSchema', () => {
  const record = {
    id: 'turn-1',
    institutionId: 'inst-1',
    callerRole: 'patient',
    callerId: 'pat-1',
    screenId: 'patient.check-in.pain',
    language: 'en',
    input: 'text',
    transcript: 'my pain is six',
    reply: 'Pain six. Shall I save that?',
    model: 'mock',
    promptVersion: 'assistant-1',
    inputRef: 'assistant-turn:turn-1',
    provider: 'mock',
    keptActions: [{ id: 'answerCheckIn', params: { item: 'pain', intensity: 6 } }],
    droppedActions: [{ id: 'openPatient', reason: 'role' }],
    createdAt: '2026-11-13T12:00:00.000Z',
  };

  it('keeps the transcript, the kept and dropped actions and where the reply came from', () => {
    expect(assistantTurnRecordSchema.safeParse(record).success).toBe(true);
  });

  it('rejects an unknown drop reason', () => {
    const bad = { ...record, droppedActions: [{ id: 'openPatient', reason: 'nope' }] };
    expect(assistantTurnRecordSchema.safeParse(bad).success).toBe(false);
  });
});
