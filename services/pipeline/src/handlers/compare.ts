import { aiItemsStateSchema } from '../state.ts';
import { compare } from '../steps/compare.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => compare(deps, aiItemsStateSchema.parse(event));
