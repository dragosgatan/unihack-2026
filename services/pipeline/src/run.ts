import type { PipelineDeps } from './ports.ts';
import type { PipelineInput } from './state.ts';
import { aiItems } from './steps/ai-items.ts';
import { compare } from './steps/compare.ts';
import { detectChange } from './steps/detect-change.ts';
import { notify, type NotifyOutput } from './steps/notify.ts';
import { report } from './steps/report.ts';
import { score } from './steps/score.ts';

export const runPipeline = async (deps: PipelineDeps, input: PipelineInput): Promise<NotifyOutput> => {
  const scored = await score(deps, input);
  const withAiItems = await aiItems(deps, scored);
  const compared = await compare(deps, withAiItems);
  const detected = await detectChange(deps, compared);
  const reported = await report(deps, detected);
  return notify(deps, reported);
};
