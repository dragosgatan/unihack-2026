import type { z } from 'zod';

export const redactedPlaceholder = '[redacted]';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const deidentify = {
  text: (text: string, identifiers: readonly string[]): string =>
    identifiers
      .map((identifier) => identifier.trim())
      .filter((identifier) => identifier.length > 0)
      .sort((a, b) => b.length - a.length)
      .reduce((redacted, identifier) => redacted.replace(new RegExp(escapeRegExp(identifier), 'giu'), redactedPlaceholder), text),

  fields: <Allowed extends z.ZodObject>(allowed: Allowed, value: unknown): z.infer<Allowed> => allowed.parse(value),
};
