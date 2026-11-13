import { pipelineInputSchema } from '../state.ts';
import { score } from '../steps/score.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => score(deps, pipelineInputSchema.parse(event));
