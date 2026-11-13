import type { AiMeta, AiOutput } from '@tempo/shared';
import type { z } from 'zod';
import type { AiPart, AiProvider, AiTask } from './provider.ts';

export class AiOutputInvalidError extends Error {
  readonly task: AiTask;
  readonly issues: string[];

  constructor(task: AiTask, issues: string[]) {
    super(`AI output for ${task} failed validation twice`);
    this.name = 'AiOutputInvalidError';
    this.task = task;
    this.issues = issues;
  }
}

export type GenerateContext = { provider: AiProvider; now: () => Date };

export type GenerateCall<Schema extends z.ZodType> = {
  task: AiTask;
  promptVersion: string;
  inputRef: string;
  system: string;
  parts: AiPart[];
  responseSchema: Schema;
};

const attempts = 2;

const issuePaths = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`);

export const generate = async <Schema extends z.ZodType>(
  { provider, now }: GenerateContext,
  call: GenerateCall<Schema>,
): Promise<AiOutput<z.infer<Schema>>> => {
  let issues: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await provider.generate({
      task: call.task,
      system: call.system,
      parts: call.parts,
      responseSchema: call.responseSchema,
    });
    const parsed = call.responseSchema.safeParse(response.data);
    if (parsed.success) {
      const meta: AiMeta = {
        model: response.model,
        promptVersion: call.promptVersion,
        inputRef: call.inputRef,
        provider: provider.name,
        createdAt: now().toISOString(),
      };
      return { output: parsed.data, meta };
    }
    issues = issuePaths(parsed.error);
  }
  throw new AiOutputInvalidError(call.task, issues);
};
