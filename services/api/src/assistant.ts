import {
  assistantActionCallSchema,
  assistantActionIdSchema,
  assistantActions,
  type AssistantActionCall,
  type AssistantActionId,
  type AssistantDroppedAction,
  type AssistantRole,
  type Language,
} from '@tempo/shared';

export type ProposedCall = { id: string; params: unknown };

export type FilteredCalls = { kept: AssistantActionCall[]; dropped: AssistantDroppedAction[] };

export const cannotDoHereReply: Record<Language, string> = {
  en: "I can't do that here.",
  ro: 'Nu pot face asta aici.',
};

export const filterAssistantCalls = (
  calls: readonly ProposedCall[],
  role: AssistantRole,
  availableActionIds: readonly AssistantActionId[],
): FilteredCalls => {
  const kept: AssistantActionCall[] = [];
  const dropped: AssistantDroppedAction[] = [];
  for (const call of calls) {
    const id = assistantActionIdSchema.safeParse(call.id);
    if (!id.success) {
      dropped.push({ id: call.id, reason: 'unregistered' });
      continue;
    }
    const roles: readonly AssistantRole[] = assistantActions[id.data].roles;
    if (!roles.includes(role)) {
      dropped.push({ id: call.id, reason: 'role' });
      continue;
    }
    if (!availableActionIds.includes(id.data)) {
      dropped.push({ id: call.id, reason: 'unavailable' });
      continue;
    }
    const parsed = assistantActionCallSchema.safeParse({ id: id.data, params: call.params });
    if (!parsed.success) {
      dropped.push({ id: call.id, reason: 'invalid-params' });
      continue;
    }
    kept.push(parsed.data);
  }
  return { kept, dropped };
};

export const safeReply = (reply: string, language: Language, { kept, dropped }: FilteredCalls): string =>
  dropped.length > 0 && kept.length === 0 ? cannotDoHereReply[language] : reply;
