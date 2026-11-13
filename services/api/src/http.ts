import type { Context, Hono } from 'hono';
import type { RouteDefinition } from '@tempo/shared';

type Parsed<Schema> = Schema extends { parse(data: unknown): infer Output } ? Output : undefined;
type PartKey = 'params' | 'query' | 'body';
type Part<Route, Key extends PartKey> = Route extends { [K in Key]: infer Schema } ? Parsed<Schema> : undefined;

export type RouteParts<Route> = {
  params: Part<Route, 'params'>;
  query: Part<Route, 'query'>;
  body: Part<Route, 'body'>;
};

export type RouteResponse<Route extends RouteDefinition> = Parsed<Route['response']>;

const statusByCode = {
  invalid_request: 400,
  code_invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof statusByCode;

export class HttpError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const errorResponse = (code: ErrorCode, message: string): Response =>
  jsonResponse({ error: { code, message } }, statusByCode[code]);

export const bearerToken = (authorization: string | undefined): string | undefined =>
  authorization?.match(/^Bearer (\S+)$/)?.[1];

const parsePart = <Route extends RouteDefinition, Key extends PartKey>(
  route: Route,
  key: Key,
  raw: unknown,
): Part<Route, Key> => {
  const schema = route[key];
  if (schema === undefined) return undefined as Part<Route, Key>;
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || key}: ${issue.message}`);
    throw new HttpError('invalid_request', `Invalid ${key}. ${issues.join('; ')}`);
  }
  return result.data as Part<Route, Key>;
};

const readJson = async (c: Context): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError('invalid_request', 'Body must be JSON');
  }
};

export const mountRoute = <Route extends RouteDefinition, Caller extends object>(
  app: Hono,
  route: Route,
  authorize: (authorization: string | undefined) => Caller | Promise<Caller>,
  handler: (input: RouteParts<Route> & Caller) => RouteResponse<Route> | Promise<RouteResponse<Route>>,
): void => {
  app.on(route.method, route.path, async (c) => {
    try {
      const caller = await authorize(c.req.header('authorization'));
      const params = parsePart(route, 'params', c.req.param());
      const query = parsePart(route, 'query', c.req.query());
      const body = parsePart(route, 'body', route.body ? await readJson(c) : undefined);
      const checked = route.response.safeParse(await handler({ params, query, body, ...caller }));
      if (!checked.success) {
        return errorResponse('internal', `Response does not match the schema for ${route.method} ${route.path}`);
      }
      return jsonResponse(checked.data, 200);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.code, error.message);
      throw error;
    }
  });
};
