import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAi, createMemoryReportFiles, type AiProvider } from '@tempo/pipeline';
import { routes, runningActivityActionIds } from '@tempo/shared';
import { createMockStaffAuth } from './auth/staff.ts';
import { signSessionToken } from './auth/device-tokens.ts';
import { createApp } from './create-app.ts';
import { buildSeed } from './mock/seed/build.ts';
import { mockStaffTokens } from './mock/seed/institution.ts';
import { call, fixedNow } from './mock/testing.ts';
import { offlinePublicData } from './public-data/index.ts';
import { createMemoryStore } from './store/memory.ts';

const secret = 'assistant-route-secret';

type Scripted = { name: string; arguments: unknown }[];

const appWith = (generate: AiProvider['generate']) => {
  const store = createMemoryStore(buildSeed(fixedNow));
  const toolNames: string[][] = [];
  const provider: AiProvider = {
    name: 'gemini',
    generate: async (request) => {
      toolNames.push('tools' in request ? request.tools.map((tool) => tool.name) : []);
      return generate(request);
    },
  };
  const app = createApp({
    store,
    staffAuth: createMockStaffAuth(store, mockStaffTokens),
    tokenSecret: async () => secret,
    clock: () => fixedNow,
    startPipeline: async () => {},
    publicData: offlinePublicData,
    ai: createAi({ provider, now: () => fixedNow }),
    reportFiles: createMemoryReportFiles(),
  });
  return { app, store, toolNames };
};

const scriptedApp = (calls: Scripted) =>
  appWith(async () => ({ data: undefined, model: 'gemini-test', calls }));

const patientToken = async () =>
  (await signSessionToken(secret, { sid: 'sess-1', pid: 'pat-1', inst: 'inst-1' }, fixedNow)).token;

const typed = (text: string, availableActionIds: readonly string[], language = 'en') => ({
  text,
  language,
  screenId: 'patient.activity.finger-tapping',
  availableActionIds,
});

const turn = async (app: ReturnType<typeof appWith>['app'], body: unknown, token: string) =>
  call(app, '/api/assistant/turn', { method: 'POST', token, body });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/assistant/turn with a scripted model', () => {
  it('only ever returns the three running-activity actions while a test runs', async () => {
    const { app, toolNames } = scriptedApp([
      { name: 'navigate', arguments: { screenId: 'patient.home' } },
      { name: 'answerCheckIn', arguments: { item: 'pain', intensity: 5 } },
      { name: 'openPatient', arguments: { spokenName: 'Elena' } },
      { name: 'cannotDo', arguments: {} },
      { name: 'respond', arguments: { reply: 'Opening the screen.' } },
    ]);
    const result = await turn(app, typed('nu mai pot', runningActivityActionIds), await patientToken());
    const body = routes.assistantTurn.response.parse(result.body);
    expect(body.actions).toEqual([{ id: 'cannotDo', params: {} }]);
    expect(body.droppedActionIds).toEqual(['navigate', 'answerCheckIn', 'openPatient']);
    expect(body.reply).toBe('Opening the screen.');
    expect(toolNames).toEqual([['repeatInstructions', 'pauseSession', 'cannotDo', 'respond']]);
  });

  it('never gives a device token a clinician action, even when the client lists it', async () => {
    const { app, store } = scriptedApp([
      { name: 'openPatient', arguments: { spokenName: 'Elena' } },
      { name: 'openMetric', arguments: { metricId: 'pain.intensity' } },
      { name: 'askRecord', arguments: { question: 'How was she?' } },
      { name: 'respond', arguments: { reply: 'Opening Elena.' } },
    ]);
    const result = await turn(app, typed('open Elena', ['openPatient', 'openMetric', 'askRecord']), await patientToken());
    const body = routes.assistantTurn.response.parse(result.body);
    expect(body.actions).toEqual([]);
    expect(body.reply).toBe("I can't do that here.");
    const stored = await store.getAssistantTurn(body.turnId);
    expect(stored?.droppedActions).toEqual([
      { id: 'openPatient', reason: 'role' },
      { id: 'openMetric', reason: 'role' },
      { id: 'askRecord', reason: 'role' },
    ]);
  });

  it('drops unregistered calls and invalid params, and replaces the reply in the request language', async () => {
    const { app, store } = scriptedApp([
      { name: 'clickElement', arguments: { selector: '#sign-off' } },
      { name: 'answerCheckIn', arguments: { item: 'pain', intensity: 'six' } },
      { name: 'respond', arguments: { reply: 'Am salvat durerea.' } },
    ]);
    const result = await turn(app, typed('durerea mea e șase', ['answerCheckIn'], 'ro'), await patientToken());
    const body = routes.assistantTurn.response.parse(result.body);
    expect(body).toMatchObject({ transcript: 'durerea mea e șase', reply: 'Nu pot face asta aici.', actions: [] });
    expect(body.droppedActionIds).toEqual(['clickElement', 'answerCheckIn']);
    const stored = await store.getAssistantTurn(body.turnId);
    expect(stored).toMatchObject({
      reply: 'Nu pot face asta aici.',
      model: 'gemini-test',
      promptVersion: 'assistant-1',
      provider: 'gemini',
      transcript: 'durerea mea e șase',
      keptActions: [],
      droppedActions: [
        { id: 'clickElement', reason: 'unregistered' },
        { id: 'answerCheckIn', reason: 'invalid-params' },
      ],
    });
  });

  it('keeps the model reply when at least one call was kept', async () => {
    const { app } = scriptedApp([
      { name: 'pauseSession', arguments: {} },
      { name: 'navigate', arguments: { screenId: 'patient.home' } },
      { name: 'respond', arguments: { reply: 'Pausing.' } },
    ]);
    const body = routes.assistantTurn.response.parse(
      (await turn(app, typed('pause', runningActivityActionIds), await patientToken())).body,
    );
    expect(body).toMatchObject({ reply: 'Pausing.', actions: [{ id: 'pauseSession', params: {} }], droppedActionIds: ['navigate'] });
  });

  it('answers 500 and logs neither the clip nor the transcript when the model fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, store } = appWith(async () => {
      throw new Error('Gemini request for assistant failed');
    });
    const clip = Buffer.from('secret clip bytes').toString('base64');
    const body = { audio: { mimeType: 'audio/webm', data: clip }, language: 'en', screenId: 'patient.home', availableActionIds: ['goBack'] };
    const result = await turn(app, body, 'mock-attending');
    expect(result).toEqual({ status: 500, body: { error: { code: 'internal', message: 'Something went wrong' } } });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(clip);
    expect(JSON.stringify(logged.mock.calls)).toContain('Gemini request for assistant failed');
    expect(await store.listAuditEntries('inst-1')).toEqual([]);
  });

  it('answers 401 for a token that is neither a staff nor a device token', async () => {
    const { app } = scriptedApp([]);
    const result = await turn(app, typed('go back', ['goBack']), 'not-a-token');
    expect(result).toEqual({ status: 401, body: { error: { code: 'unauthenticated', message: 'Unknown, expired or missing token' } } });
  });
});
