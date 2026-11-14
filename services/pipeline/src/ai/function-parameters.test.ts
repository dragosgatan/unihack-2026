import { assistantActionIds, assistantActions } from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import { functionParameters } from './function-parameters.ts';

const unsupported = ['anyOf', 'oneOf', 'allOf', '$ref', '$schema', 'const', 'pattern', 'additionalProperties', 'exclusiveMinimum'];

const keysOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(keysOf);
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => [key, ...keysOf(value)]);
};

describe('functionParameters', () => {
  it.each(assistantActionIds)('declares %s as a flat object Gemini accepts', (id) => {
    const schema = functionParameters(assistantActions[id].params);
    expect(schema['type']).toBe('object');
    expect(schema['properties']).toBeTypeOf('object');
    const keys = keysOf(schema);
    for (const keyword of unsupported) expect(keys).not.toContain(keyword);
  });

  it('merges the check-in union into one object keyed by item', () => {
    const schema = functionParameters(assistantActions.answerCheckIn.params);
    expect(schema).toMatchObject({
      type: 'object',
      required: ['item'],
      properties: {
        item: { type: 'string', enum: ['pain', 'medication', 'episodes'] },
        intensity: { type: 'integer', minimum: 0, maximum: 10, description: 'Only when item is pain.' },
        medications: { type: 'array', description: 'Only when item is medication.' },
        episodes: { type: 'array', description: 'Only when item is episodes.' },
      },
    });
  });

  it('is never stricter than the registry schema it declares', () => {
    const schema = functionParameters(assistantActions.logEpisode.params);
    expect(schema).toEqual({
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['fall', 'dizziness', 'seizure', 'freezing', 'confusion', 'spasm'] },
        count: { type: 'integer' },
        description: { type: 'string' },
      },
      required: ['type', 'count'],
    });
  });
});
