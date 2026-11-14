import { beforeEach, describe, expect, it } from 'vitest';
import { assistantPromptVersion } from '@tempo/pipeline';
import { assistantViaHeader, routes } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

const viaAssistant = { [assistantViaHeader]: 'assistant' };

export const assistantSuite = (factory: HarnessFactory): void => {
  let h: Harness;

  beforeEach(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const turn = (body: unknown, token?: string) =>
    call(h.app, '/api/assistant/turn', { method: 'POST', body, ...(token === undefined ? {} : { token }) });

  const typed = (text: string, availableActionIds: string[]) => ({
    text,
    language: 'en',
    screenId: 'clinician.patients',
    availableActionIds,
  });

  const deviceToken = async (): Promise<string> => {
    const created = await call(h.app, `/api/patients/${h.id('pat-1')}/sessions`, { method: 'POST', body: { mode: 'kiosk' } });
    const { code } = expectOk(routes.createSession, created);
    return expectOk(routes.redeemSessionCode, await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }))
      .token;
  };

  const institutionId = () => h.id(h.seed.institution.id);

  describe('POST /api/assistant/turn', () => {
    it('answers 401 without a token or with an unknown one', async () => {
      expectError(await turn(typed('go back', ['goBack'])), 401, 'unauthenticated');
      expectError(await turn(typed('go back', ['goBack']), 'mock-nobody'), 401, 'unauthenticated');
    });

    it('runs for a staff token and stores the turn without the audio', async () => {
      const result = expectOk(routes.assistantTurn, await turn(typed('open Elena Dorian', ['openPatient']), 'mock-attending'));
      expect(result).toMatchObject({
        transcript: 'open Elena Dorian',
        reply: 'Opening that patient.',
        actions: [{ id: 'openPatient', params: { spokenName: 'Elena Dorian' } }],
        droppedActionIds: [],
      });
      const stored = await h.store.getAssistantTurn(result.turnId);
      expect(stored).toMatchObject({
        id: result.turnId,
        institutionId: institutionId(),
        callerRole: 'attending',
        callerId: h.id('staff-att-1'),
        screenId: 'clinician.patients',
        input: 'text',
        transcript: 'open Elena Dorian',
        model: 'mock',
        promptVersion: assistantPromptVersion,
        provider: 'mock',
        keptActions: result.actions,
        droppedActions: [],
        createdAt: fixedNow.toISOString(),
      });
    });

    it('runs for a device token as the patient, and keeps clinician actions away from it', async () => {
      const token = await deviceToken();
      const result = expectOk(routes.assistantTurn, await turn(typed('open Elena Dorian', ['openPatient', 'goBack']), token));
      expect(result.actions).toEqual([]);
      expect(result.droppedActionIds).toEqual(['openPatient']);
      expect(result.reply).toBe("I can't do that here.");
      const stored = await h.store.getAssistantTurn(result.turnId);
      expect(stored).toMatchObject({ callerRole: 'patient', callerId: h.id('pat-1'), droppedActions: [{ id: 'openPatient', reason: 'role' }] });
    });

    it('stores a spoken turn with its transcript and never the clip', async () => {
      const clip = Buffer.from('a short recorded clip').toString('base64');
      const body = { audio: { mimeType: 'audio/webm;codecs=opus', data: clip }, language: 'en', screenId: 'patient.home', availableActionIds: ['goBack'] };
      const result = expectOk(routes.assistantTurn, await turn(body, await deviceToken()));
      expect(result).toMatchObject({ transcript: 'go back', actions: [{ id: 'goBack', params: {} }] });
      const stored = await h.store.getAssistantTurn(result.turnId);
      expect(stored?.input).toBe('audio');
      expect(JSON.stringify(stored)).not.toContain(clip);
      expect(stored).not.toHaveProperty('audio');
    });

    it('rejects a request with both a clip and text, or neither', async () => {
      const audio = { mimeType: 'audio/webm', data: 'UklGRiQAAABXQVZF' };
      expectError(await turn({ ...typed('go back', ['goBack']), audio }, 'mock-attending'), 400, 'invalid_request');
      const { text, ...neither } = typed('go back', ['goBack']);
      expect(text).toBe('go back');
      expectError(await turn(neither, 'mock-attending'), 400, 'invalid_request');
    });
  });

  describe('audit log and the assistant marker', () => {
    const createSession = (headers: Record<string, string> = {}) =>
      call(h.app, `/api/patients/${h.id('pat-1')}/sessions`, { method: 'POST', body: { mode: 'kiosk' }, headers });

    it('marks a session created through the assistant and leaves a tapped one unmarked', async () => {
      const tapped = expectOk(routes.createSession, await createSession());
      const spoken = expectOk(routes.createSession, await createSession(viaAssistant));
      const entries = await h.store.listAuditEntries(institutionId());
      const tappedEntry = entries.find((entry) => entry.entityId === tapped.session.id);
      const spokenEntry = entries.find((entry) => entry.entityId === spoken.session.id);
      expect(tappedEntry).toMatchObject({ action: 'create', entityType: 'session', patientId: h.id('pat-1'), actorRole: 'attending' });
      expect(tappedEntry).not.toHaveProperty('via');
      expect(spokenEntry).toMatchObject({ action: 'create', entityType: 'session', via: 'assistant' });
    });

    it('refuses an unknown marker value', async () => {
      expectError(await createSession({ [assistantViaHeader]: 'voice' }), 400, 'invalid_request');
    });

    it('refuses a suggestion decision through the assistant and changes nothing', async () => {
      const base = `/api/patients/${h.id('pat-1')}/suggestions`;
      const [suggestion] = expectOk(routes.listSuggestions, await call(h.app, base)).suggestions;
      const decided = await call(h.app, `${base}/${suggestion?.id ?? ''}/decision`, {
        method: 'POST',
        body: { status: 'accepted' },
        headers: viaAssistant,
      });
      expectError(decided, 403, 'forbidden');
      expect(expectOk(routes.listSuggestions, await call(h.app, base)).suggestions[0]?.status).toBe('proposed');
      expect(await h.store.listAuditEntries(institutionId())).toEqual([]);
    });

    it('refuses pairing and revoking through the assistant', async () => {
      const patient = `/api/patients/${h.id('pat-1')}`;
      expectError(await call(h.app, `${patient}/pairing-codes`, { method: 'POST', headers: viaAssistant }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/devices/dev-1/revoke`, { method: 'POST', headers: viaAssistant }), 403, 'forbidden');
      expect(await h.store.listAuditEntries(institutionId())).toEqual([]);
    });

    it('writes an audit entry for a suggestion decision, a pairing code and a revoked device', async () => {
      const patient = `/api/patients/${h.id('pat-1')}`;
      const later = (seconds: number) => h.setNow(new Date(fixedNow.getTime() + seconds * 1000));
      const [suggestion] = expectOk(routes.listSuggestions, await call(h.app, `${patient}/suggestions`)).suggestions;
      await call(h.app, `${patient}/suggestions/${suggestion?.id ?? ''}/decision`, { method: 'POST', body: { status: 'dismissed' } });
      later(1);
      const { code } = expectOk(routes.createPairingCode, await call(h.app, `${patient}/pairing-codes`, { method: 'POST' }));
      const paired = await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code } });
      const { deviceId } = expectOk(routes.redeemPairingCode, paired);
      later(2);
      await call(h.app, `${patient}/devices/${deviceId}/revoke`, { method: 'POST' });
      const entries = await h.store.listAuditEntries(institutionId());
      expect(entries.map(({ action, entityType, entityId }) => ({ action, entityType, entityId }))).toEqual([
        { action: 'update', entityType: 'suggestion', entityId: suggestion?.id },
        { action: 'create', entityType: 'pairing-code', entityId: h.id('pat-1') },
        { action: 'update', entityType: 'device', entityId: deviceId },
      ]);
      expect(entries.map((entry) => entry.at)).toEqual([0, 1, 2].map((s) => new Date(fixedNow.getTime() + s * 1000).toISOString()));
    });
  });
};
