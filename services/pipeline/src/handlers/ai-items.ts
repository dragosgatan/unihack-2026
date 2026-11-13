import { pipelineInputSchema } from '../state.ts';
import { aiItems } from '../steps/ai-items.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => aiItems(deps, pipelineInputSchema.parse(event));
