import { keepPreviousData, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiErrorSchema, routes, type MetricId, type MetricRange, type RouteName, type Side } from '@tempo/shared';
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
  patientFlags: (patientId: string) => ['patients', patientId, 'flags'] as const,
  metricSeries: (patientId: string, metricId: MetricId, range: MetricRange, side: Side | undefined) =>
    ['patients', patientId, 'metrics', metricId, range, side ?? null] as const,
};

interface ApiQueryOptions {
  placeholderData?: typeof keepPreviousData;
}

async function fetchSignedIn<N extends StaffGetRoute>(queryClient: QueryClient, name: N, input: RouteInput<N>): Promise<RouteResponse<N>> {
  const token = getToken();
  if (token === null) throw new ApiRequestError(401, 'unauthenticated', 'Not signed in');
  try {
    return await apiFetch(name, input, token);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) signOut(queryClient);
    throw error;
  }
}

function useApiQuery<N extends StaffGetRoute>(queryKey: readonly unknown[], name: N, input: RouteInput<N>, options: ApiQueryOptions = {}) {
  const queryClient = useQueryClient();
  return useQuery({
    ...options,
    queryKey,
    queryFn: () => fetchSignedIn(queryClient, name, input),
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

export function usePatientFlags(patientId: string) {
  return useApiQuery(queryKeys.patientFlags(patientId), 'listPatientFlags', { params: { patientId } });
}

export function useMetricSeries(patientId: string, metricId: MetricId, range: MetricRange, side?: Side) {
  return useApiQuery(
    queryKeys.metricSeries(patientId, metricId, range, side),
    'getMetricSeries',
    { params: { patientId, metricId }, query: { range, side } },
    { placeholderData: keepPreviousData },
  );
}

export interface SeriesRequest {
  metricId: MetricId;
  side: Side | undefined;
}

export function useMetricSeriesList(patientId: string, requests: readonly SeriesRequest[], range: MetricRange) {
  const queryClient = useQueryClient();
  return useQueries({
    queries: requests.map(({ metricId, side }) => ({
      queryKey: queryKeys.metricSeries(patientId, metricId, range, side),
      queryFn: () => fetchSignedIn(queryClient, 'getMetricSeries', { params: { patientId, metricId }, query: { range, side } }),
      placeholderData: keepPreviousData,
    })),
  });
}
