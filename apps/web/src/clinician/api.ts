import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorSchema, routes, type RouteName } from '@tempo/shared';
import { getToken, signOut } from './auth.ts';

type Routes = typeof routes;

type StaffGetRoute = {
  [N in RouteName]: Routes[N] extends { method: 'GET'; auth: 'staff' } ? N : never;
}[RouteName];

type SchemaOutput<S> = S extends { parse: (data: unknown) => infer O } ? O : never;

export type RouteResponse<N extends StaffGetRoute> = SchemaOutput<Routes[N]['response']>;

export type RouteInput<N extends StaffGetRoute> = (Routes[N] extends { params: infer P } ? { params: SchemaOutput<P> } : { params?: never }) &
  (Routes[N] extends { query: infer Q } ? { query?: SchemaOutput<Q> } : { query?: never });

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path: string, params: object | undefined, query: object | undefined): string {
  const values = new Map<string, unknown>(Object.entries(params ?? {}));
  const filled = path.replace(/:(\w+)/g, (_, key: string) => encodeURIComponent(String(values.get(key) ?? '')));
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `${filled}?${queryString}` : filled;
}

async function readError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) return new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
  return new ApiRequestError(response.status, response.status === 401 ? 'unauthenticated' : 'http_error', response.statusText);
}

export async function apiFetch<N extends StaffGetRoute>(name: N, input: RouteInput<N>, token: string): Promise<RouteResponse<N>> {
  const route: Routes[StaffGetRoute] = routes[name];
  const response = await fetch(buildUrl(route.path, input.params, input.query), {
    method: route.method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await readError(response);
  return route.response.parse(await response.json()) as RouteResponse<N>;
}

export const queryKeys = {
  me: ['me'] as const,
  patients: ['patients'] as const,
  patient: (patientId: string) => ['patients', patientId] as const,
  patientMetrics: (patientId: string) => ['patients', patientId, 'metrics'] as const,
};

function useApiQuery<N extends StaffGetRoute>(queryKey: readonly unknown[], name: N, input: RouteInput<N>) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey,
    queryFn: async () => {
      const token = getToken();
      if (token === null) throw new ApiRequestError(401, 'unauthenticated', 'Not signed in');
      try {
        return await apiFetch(name, input, token);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) signOut(queryClient);
        throw error;
      }
    },
  });
}

export function useMe() {
  return useApiQuery(queryKeys.me, 'me', {});
}

export function usePatients() {
  return useApiQuery(queryKeys.patients, 'listPatients', {});
}

export function usePatient(patientId: string) {
  return useApiQuery(queryKeys.patient(patientId), 'getPatient', { params: { patientId } });
}

export function usePatientMetrics(patientId: string) {
  return useApiQuery(queryKeys.patientMetrics(patientId), 'listPatientMetrics', { params: { patientId } });
}
