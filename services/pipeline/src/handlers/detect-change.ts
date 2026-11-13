import { compareStateSchema } from '../state.ts';
import { detectChange } from '../steps/detect-change.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => detectChange(deps, compareStateSchema.parse(event));
