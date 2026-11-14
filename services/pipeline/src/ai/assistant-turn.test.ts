import { assistantActionIds, runningActivityActionIds, type AssistantActionId, type Language } from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import { assistantPromptVersion } from './assistant-turn.ts';
import { AiOutputInvalidError, createAi, createMockProvider, type AiFunctionCall, type AiProvider, type AiRequest } from './index.ts';

const now = () => new Date('2026-11-13T12:00:00.000Z');
const webm = { mimeType: 'audio/webm', data: new Uint8Array([26, 69, 223, 163]) };

const scripted = (calls: AiFunctionCall[]) => {
  const requests: AiRequest[] = [];
  const provider: AiProvider = {
    name: 'gemini',
    generate: async (request) => {
      requests.push(request);
      return { data: undefined, model: 'gemini-test', calls };
    },
  };
  return { ai: createAi({ provider, now }), requests };
};

const toolNames = (request: AiRequest | undefined): string[] =>
  request && 'tools' in request ? request.tools.map((tool) => tool.name) : [];

const typed = (text: string, availableActionIds: readonly AssistantActionId[] = assistantActionIds, language: Language = 'en') => ({
  language,
  screenId: 'patient.home',
  availableActionIds,
  input: { text },
  inputRef: 'assistant-turn:turn-1',
});

describe('assistantTurn', () => {
  it('declares only the available actions plus respond, and sends no response schema', async () => {
    const { ai, requests } = scripted([{ name: 'respond', arguments: { reply: 'Okay.' } }]);
    await ai.assistantTurn(typed('pause', runningActivityActionIds));
    expect(toolNames(requests[0])).toEqual(['repeatInstructions', 'pauseSession', 'cannotDo', 'respond']);
    expect(requests[0]).not.toHaveProperty('responseSchema');
    expect(requests[0]?.task).toBe('assistant');
    expect(requests[0]?.system).toContain('patient.home');
    expect(requests[0]?.parts).toEqual([{ text: 'The user speaks English.' }, { text: 'pause' }]);
  });

  it('takes the transcript of a typed request from the text, not the model', async () => {
    const { ai } = scripted([
      { name: 'pauseSession', arguments: {} },
      { name: 'respond', arguments: { reply: 'Pausing.', transcript: 'something else' } },
    ]);
    const { output, meta } = await ai.assistantTurn(typed('pause please'));
    expect(output).toEqual({ transcript: 'pause please', reply: 'Pausing.', calls: [{ id: 'pauseSession', params: {} }] });
    expect(meta).toEqual({
      model: 'gemini-test',
      promptVersion: assistantPromptVersion,
      inputRef: 'assistant-turn:turn-1',
      provider: 'gemini',
      createdAt: '2026-11-13T12:00:00.000Z',
    });
  });

  it('takes the transcript of a clip from respond, and returns undeclared calls for the API to drop', async () => {
    const { ai, requests } = scripted([
      { name: 'clickElement', arguments: { selector: '#ok' } },
      { name: 'respond', arguments: { reply: 'Mă întorc.', transcript: 'înapoi' } },
    ]);
    const { output } = await ai.assistantTurn({ ...typed('', ['goBack'], 'ro'), input: { audio: webm } });
    expect(output).toEqual({ transcript: 'înapoi', reply: 'Mă întorc.', calls: [{ id: 'clickElement', params: { selector: '#ok' } }] });
    expect(requests[0]?.parts).toEqual([{ text: 'The user speaks Romanian.' }, webm]);
  });

  it('falls back to a short localized reply and an empty transcript when respond is missing', async () => {
    const { ai } = scripted([{ name: 'goBack', arguments: {} }]);
    const english = await ai.assistantTurn({ ...typed('', ['goBack']), input: { audio: webm } });
    expect(english.output).toMatchObject({ transcript: '', reply: 'Sorry, I did not catch that.' });
    const romanian = await ai.assistantTurn(typed('înapoi', ['goBack'], 'ro'));
    expect(romanian.output).toMatchObject({ transcript: 'înapoi', reply: 'Scuze, nu am înțeles.' });
  });

  it('retries once and then throws a typed error when the output stays invalid', async () => {
    const { ai, requests } = scripted([{ name: '', arguments: {} }]);
    const error = await ai.assistantTurn(typed('go back')).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiOutputInvalidError);
    expect(error).toMatchObject({ task: 'assistant' });
    expect(requests).toHaveLength(2);
  });
});

describe('assistantTurn with the mock provider', () => {
  const ai = createAi({ provider: createMockProvider(), now });

  it.each([
    ['go back', 'en', 'goBack', {}, 'Going back.'],
    ['Înapoi', 'ro', 'goBack', {}, 'Mă întorc.'],
    ['repeat the instructions', 'en', 'repeatInstructions', {}, 'Here are the instructions again.'],
    ['repetă', 'ro', 'repeatInstructions', {}, 'Iată din nou instrucțiunile.'],
    ['Pause', 'en', 'pauseSession', {}, 'Pausing.'],
    ['pauză', 'ro', 'pauseSession', {}, 'Pun pauză.'],
    ["I can't do this", 'en', 'cannotDo', {}, 'Opening the "I can\'t do this" screen.'],
    ['nu pot', 'ro', 'cannotDo', {}, 'Deschid ecranul „Nu pot face asta”.'],
    ['open Elena Dorian', 'en', 'openPatient', { spokenName: 'Elena Dorian' }, 'Opening that patient.'],
    ['deschide Elena Dorian', 'ro', 'openPatient', { spokenName: 'Elena Dorian' }, 'Deschid pacientul.'],
    ['show finger tapping', 'en', 'openMetric', { metricId: 'finger-tapping.taps-per-second' }, 'Showing finger tapping.'],
    ['how was her tapping last month', 'en', 'askRecord', { question: 'how was her tapping last month' }, 'Asking the record.'],
    ['cum a fost mersul ei', 'ro', 'askRecord', { question: 'cum a fost mersul ei' }, 'Întreb dosarul.'],
    ['my pain is 6', 'en', 'answerCheckIn', { item: 'pain', intensity: 6 }, 'Pain noted. Shall I save that?'],
  ] as const)('maps "%s" (%s) to %s', async (text, language, id, params, reply) => {
    const { output } = await ai.assistantTurn(typed(text, assistantActionIds, language));
    expect(output).toEqual({ transcript: text, reply, calls: [{ id, params }] });
  });

  it.each([
    ['do the test for me', 'en', 'That one is yours to do. I can repeat the instructions.'],
    ['accept the suggestion', 'en', 'You have to accept a suggestion by hand.'],
    ['how did I do', 'en', 'Your therapist is the one to ask about that.'],
    ['cum m-am descurcat', 'ro', 'Despre asta întrebați-vă terapeutul.'],
    ['sing a song', 'en', "I can't do that here."],
    ['cântă ceva', 'ro', 'Nu pot face asta aici.'],
  ] as const)('refuses "%s" (%s) with no calls', async (text, language, reply) => {
    const { output } = await ai.assistantTurn(typed(text, assistantActionIds, language));
    expect(output).toEqual({ transcript: text, reply, calls: [] });
  });

  it('says it cannot when the matching function is not declared on this screen', async () => {
    const { output } = await ai.assistantTurn(typed('open Elena Dorian', runningActivityActionIds));
    expect(output).toEqual({ transcript: 'open Elena Dorian', reply: "I can't do that here.", calls: [] });
  });

  it('treats any clip as "go back"', async () => {
    const { output, meta } = await ai.assistantTurn({ ...typed('', ['goBack']), input: { audio: webm } });
    expect(output).toEqual({ transcript: 'go back', reply: 'Going back.', calls: [{ id: 'goBack', params: {} }] });
    expect(meta).toMatchObject({ model: 'mock', provider: 'mock', promptVersion: assistantPromptVersion });
  });
});
