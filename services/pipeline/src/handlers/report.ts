import { compareStateSchema } from '../state.ts';
import { report } from '../steps/report.ts';
import { deps } from './deps.ts';

export const handler = async (event: unknown) => report(deps, compareStateSchema.parse(event));
