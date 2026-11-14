import { z } from 'zod';

export type JsonSchema = { [keyword: string]: unknown };

const keptKeywords = new Set([
  'type',
  'description',
  'enum',
  'properties',
  'required',
  'items',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
]);

const isSchema = (value: unknown): value is JsonSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const constType = (value: unknown): string =>
  typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;

const enumOf = (schema: JsonSchema): unknown[] | undefined => (Array.isArray(schema['enum']) ? schema['enum'] : undefined);

const propertiesOf = (schema: JsonSchema): JsonSchema => (isSchema(schema['properties']) ? schema['properties'] : {});

const requiredOf = (schema: JsonSchema): string[] =>
  Array.isArray(schema['required']) ? schema['required'].filter((name) => typeof name === 'string') : [];

const withNote = (schema: JsonSchema, note: string): JsonSchema => {
  const description = typeof schema['description'] === 'string' ? `${schema['description']} ` : '';
  return { ...schema, description: `${description}${note}` };
};

const mergeObjects = (options: JsonSchema[]): JsonSchema => {
  const optionProperties = options.map(propertiesOf);
  const discriminator = Object.keys(optionProperties[0] ?? {}).find((name) =>
    optionProperties.every((properties) => {
      const property = properties[name];
      return isSchema(property) && enumOf(property)?.length === 1;
    }),
  );
  const tagOf = (properties: JsonSchema): string => {
    const property = discriminator === undefined ? undefined : properties[discriminator];
    return isSchema(property) ? String(enumOf(property)?.[0]) : '';
  };

  const properties: JsonSchema = {};
  if (discriminator !== undefined) {
    properties[discriminator] = { type: 'string', enum: optionProperties.map(tagOf) };
  }
  for (const own of optionProperties) {
    for (const [name, schema] of Object.entries(own)) {
      if (name === discriminator || name in properties || !isSchema(schema)) continue;
      const owners = optionProperties.filter((other) => name in other);
      properties[name] =
        discriminator === undefined || owners.length === options.length
          ? schema
          : withNote(schema, `Only when ${discriminator} is ${owners.map(tagOf).join(' or ')}.`);
    }
  }

  const requiredEverywhere = requiredOf(options[0] ?? {}).filter((name) =>
    options.every((option) => requiredOf(option).includes(name)),
  );
  const required = [...new Set([...(discriminator === undefined ? [] : [discriminator]), ...requiredEverywhere])];
  return { type: 'object', properties, required };
};

const mergeUnion = (options: JsonSchema[]): JsonSchema => {
  if (options.length > 0 && options.every((option) => option['type'] === 'object')) return mergeObjects(options);
  const values = options.map(enumOf);
  if (options.length > 0 && values.every((value) => value !== undefined)) {
    return { type: options[0]?.['type'] ?? 'string', enum: values.flat() };
  }
  throw new Error('Cannot declare a union of mixed schemas as function parameters');
};

const flatten = (node: JsonSchema): JsonSchema => {
  const options = node['anyOf'] ?? node['oneOf'];
  if (Array.isArray(options)) return mergeUnion(options.filter(isSchema).map(flatten));
  const flat: JsonSchema = {};
  for (const [keyword, value] of Object.entries(node)) {
    if (keyword === 'const') {
      flat['enum'] = [value];
      if (node['type'] === undefined) flat['type'] = constType(value);
    } else if (keyword === 'properties' && isSchema(value)) {
      flat['properties'] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, isSchema(child) ? flatten(child) : {}]),
      );
    } else if (keyword === 'items' && isSchema(value)) {
      flat['items'] = flatten(value);
    } else if (keptKeywords.has(keyword) && !(keyword === 'maximum' && value === Number.MAX_SAFE_INTEGER)) {
      flat[keyword] = value;
    }
  }
  return flat;
};

export const functionParameters = (schema: z.ZodType): JsonSchema => {
  const json: unknown = z.toJSONSchema(schema);
  if (!isSchema(json)) throw new Error('A function parameter schema must be an object');
  return flatten(json);
};
