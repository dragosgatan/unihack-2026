import { ExecutionAlreadyExists, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { routes } from '@tempo/shared';
import { describe, expect, it, vi } from 'vitest';
import { createMockStaffAuth } from './auth/staff.ts';
import { createApp } from './create-app.ts';
import { buildSeed, demoSessionCodes } from './mock/seed/build.ts';
import { mockStaffTokens } from './mock/seed/institution.ts';
import { call, fingerTappingSubmission, fixedNow } from './mock/testing.ts';
import { createStepFunctionsStarter } from './pipeline-starter.ts';
import { offlinePublicData } from './public-data/index.ts';
import { createMemoryStore } from './store/memory.ts';

const stateMachineArn = 'arn:aws:states:eu-central-1:123456789012:stateMachine:pipeline';

const clientFailingWith = (error?: Error) => {
  const client = new SFNClient({ region: 'eu-central-1' });
  const send = vi.spyOn(client, 'send').mockImplementation(async () => {
    if (error) throw error;
    return {};
  });
  return { client, send };
};

describe('createStepFunctionsStarter', () => {
  it('starts one execution named after the session', async () => {
    const { client, send } = clientFailingWith();
    await createStepFunctionsStarter(stateMachineArn, client)('sess-1');
    const [command] = send.mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(StartExecutionCommand);
    expect(command?.input).toEqual({ stateMachineArn, name: 'sess-1', input: JSON.stringify({ sessionId: 'sess-1' }) });
  });

  it('treats an execution that already exists as started', async () => {
    const { client } = clientFailingWith(new ExecutionAlreadyExists({ message: 'exists', $metadata: {} }));
    await expect(createStepFunctionsStarter(stateMachineArn, client)('sess-1')).resolves.toBeUndefined();
  });

  it('passes on any other error', async () => {
    const { client } = clientFailingWith(new Error('throttled'));
    await expect(createStepFunctionsStarter(stateMachineArn, client)('sess-1')).rejects.toThrow('throttled');
  });
});

describe('session submit', () => {
  it('still stores the results and answers when the pipeline cannot be started', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createMemoryStore(buildSeed(fixedNow));
    const app = createApp({
      store,
      staffAuth: createMockStaffAuth(store, mockStaffTokens),
      tokenSecret: async () => 'secret',
      clock: () => fixedNow,
      startPipeline: async () => {
        throw new Error('state machine unavailable');
      },
      publicData: offlinePublicData,
      demoSessionCodes,
    });
    const redeemed = routes.redeemSessionCode.response.parse(
      (await call(app, '/api/device/session-code', { method: 'POST', body: { code: '222222' } })).body,
    );

    const submitted = await call(app, `/api/sessions/${redeemed.session.id}/submit`, {
      method: 'POST',
      token: redeemed.token,
      body: fingerTappingSubmission,
    });

    expect(submitted).toEqual({ status: 200, body: { sessionId: redeemed.session.id, status: 'submitted' } });
    expect(await store.listResults(redeemed.session.id)).toHaveLength(1);
    expect(JSON.stringify(logged.mock.calls)).toContain(redeemed.session.id);
    logged.mockRestore();
  });
});
