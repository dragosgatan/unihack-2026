import { compareStateSchema } from '../state.ts';
import { suggest } from '../steps/suggest.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => suggest(deps, compareStateSchema.parse(event));
