import { pipelineInputSchema } from '../state.ts';
import { notify } from '../steps/notify.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => notify(deps, pipelineInputSchema.parse(event));
