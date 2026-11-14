import { describe, expect, it } from 'vitest';
import { activityIds, assistantActions, runningActivityActionIds, type AssistantActionId } from '@tempo/shared';
import { activityScreenId, patientScreenActions, pendingAssistantActionIds } from './voice-screens.ts';

const screens = Object.entries(patientScreenActions) as [string, readonly string[]][];
const isRegistered = (id: string): id is AssistantActionId => id in assistantActions;

describe('patient voice screens', () => {
  it('gives every activity a screen', () => {
    for (const activityId of activityIds) expect(patientScreenActions).toHaveProperty([activityScreenId(activityId)]);
  });

  it('offers only repeat, pause and cannot do while a test or exercise runs, and nothing during word recall', () => {
    for (const [screenId, actions] of screens.filter(([id]) => id.startsWith('patient.activity.'))) {
      expect(runningActivityActionIds, screenId).toEqual(expect.arrayContaining([...actions]));
    }
    expect(patientScreenActions['patient.activity.word-recall']).toEqual([]);
  });

  it('offers nothing before the phone is paired and unlocked', () => {
    for (const screenId of ['patient.session.code', 'patient.home.pair', 'patient.home.choose-pin', 'patient.home.unlock', 'patient.home.forgot-pin'] as const) {
      expect(patientScreenActions[screenId]).toEqual([]);
    }
  });

  it('offers only registered patient actions or ones waiting to be registered', () => {
    for (const [screenId, actions] of screens) {
      for (const id of actions) {
        if (isRegistered(id)) expect(assistantActions[id].roles, `${screenId} ${id}`).toContain('patient');
        else expect(pendingAssistantActionIds, `${screenId} ${id}`).toContain(id);
      }
    }
  });
});
