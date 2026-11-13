import { ExecutionAlreadyExists, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

export type PipelineStarter = (sessionId: string) => Promise<void>;

export const createStepFunctionsStarter =
  (stateMachineArn: string, client: SFNClient = new SFNClient({})): PipelineStarter =>
  async (sessionId) => {
    try {
      await client.send(
        new StartExecutionCommand({ stateMachineArn, name: sessionId, input: JSON.stringify({ sessionId }) }),
      );
    } catch (error) {
      if (!(error instanceof ExecutionAlreadyExists)) throw error;
    }
  };
