import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  apiErrorSchema,
  routes,
  type CheckInItem,
  type MetricId,
  type MetricRange,
  type DeviceListResponse,
  type RouteName,
  type Side,
  type SuggestionDecisionRequest,
  type SuggestionListResponse,
} from '@tempo/shared';
import { getToken, signOut } from './auth.ts';

type Routes = typeof routes;

type StaffGetRoute = {
  [N in RouteName]: Routes[N] extends { method: 'GET'; auth: 'staff' } ? N : never;
}[RouteName];

type StaffPostRoute = {
  [N in RouteName]: Routes[N] extends { method: 'POST'; auth: 'staff' } ? N : never;
}[RouteName];

type SchemaOutput<S> = S extends { parse: (data: unknown) => infer O } ? O : never;

export type RouteResponse<N extends StaffGetRoute> = SchemaOutput<Routes[N]['response']>;

export type RouteInput<N extends StaffGetRoute> = (Routes[N] extends { params: infer P } ? { params: SchemaOutput<P> } : { params?: never }) &
  (Routes[N] extends { query: infer Q } ? { query?: SchemaOutput<Q> } : { query?: never });

export type PostResponse<N extends StaffPostRoute> = SchemaOutput<Routes[N]['response']>;

export type PostInput<N extends StaffPostRoute> = (Routes[N] extends { params: infer P } ? { params: SchemaOutput<P> } : { params?: never }) &
  (Routes[N] extends { body: infer B } ? { body: SchemaOutput<B> } : { body?: never });

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

export async function apiPost<N extends StaffPostRoute>(name: N, input: PostInput<N>, token: string): Promise<PostResponse<N>> {
  const route: Routes[StaffPostRoute] = routes[name];
  const body = 'body' in route ? JSON.stringify(route.body.parse(input.body)) : undefined;
  const response = await fetch(buildUrl(route.path, input.params, undefined), {
    method: route.method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body,
  });
  if (!response.ok) throw await readError(response);
  return route.response.parse(await response.json()) as PostResponse<N>;
}

export const queryKeys = {
  me: ['me'] as const,
  patients: ['patients'] as const,
  patient: (patientId: string) => ['patients', patientId] as const,
  patientMetrics: (patientId: string) => ['patients', patientId, 'metrics'] as const,
  patientFlags: (patientId: string) => ['patients', patientId, 'flags'] as const,
  patientSessions: (patientId: string) => ['patients', patientId, 'sessions'] as const,
  patientSuggestions: (patientId: string) => ['patients', patientId, 'suggestions'] as const,
  patientDevices: (patientId: string) => ['patients', patientId, 'devices'] as const,
  patientCheckIns: (patientId: string, range: MetricRange, item: CheckInItem | undefined) =>
    ['patients', patientId, 'check-ins', range, item ?? null] as const,
  patientEpisodes: (patientId: string, range: MetricRange) => ['patients', patientId, 'episodes', range] as const,
  metricSeries: (patientId: string, metricId: MetricId, range: MetricRange, side: Side | undefined) =>
    ['patients', patientId, 'metrics', metricId, range, side ?? null] as const,
};

interface ApiQueryOptions {
  placeholderData?: typeof keepPreviousData;
  refetchInterval?: number | false;
}

async function withSignedIn<T>(queryClient: QueryClient, request: (token: string) => Promise<T>): Promise<T> {
  const token = getToken();
  if (token === null) throw new ApiRequestError(401, 'unauthenticated', 'Not signed in');
  try {
    return await request(token);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) signOut(queryClient);
    throw error;
  }
}

function fetchSignedIn<N extends StaffGetRoute>(queryClient: QueryClient, name: N, input: RouteInput<N>): Promise<RouteResponse<N>> {
  return withSignedIn(queryClient, (token) => apiFetch(name, input, token));
}

function postSignedIn<N extends StaffPostRoute>(queryClient: QueryClient, name: N, input: PostInput<N>): Promise<PostResponse<N>> {
  return withSignedIn(queryClient, (token) => apiPost(name, input, token));
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

export function usePatientSessions(patientId: string) {
  return useApiQuery(queryKeys.patientSessions(patientId), 'listPatientSessions', { params: { patientId } });
}

export function usePatientSuggestions(patientId: string) {
  return useApiQuery(queryKeys.patientSuggestions(patientId), 'listSuggestions', { params: { patientId } });
}

export function usePatientDevices(patientId: string, refetchInterval: number | false = false) {
  return useApiQuery(queryKeys.patientDevices(patientId), 'listDevices', { params: { patientId } }, { refetchInterval });
}

export function usePatientCheckIns(patientId: string, range: MetricRange, item?: CheckInItem) {
  return useApiQuery(
    queryKeys.patientCheckIns(patientId, range, item),
    'listPatientCheckIns',
    { params: { patientId }, query: { range, item } },
    { placeholderData: keepPreviousData },
  );
}

export function usePatientEpisodes(patientId: string, range: MetricRange) {
  return useApiQuery(
    queryKeys.patientEpisodes(patientId, range),
    'listPatientEpisodes',
    { params: { patientId }, query: { range } },
    { placeholderData: keepPreviousData },
  );
}

export function useCreatePairingCode(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postSignedIn(queryClient, 'createPairingCode', { params: { patientId } }),
  });
}

export function useRevokeDevice(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => postSignedIn(queryClient, 'revokeDevice', { params: { patientId, deviceId } }),
    onSuccess: ({ device }) => {
      queryClient.setQueryData<DeviceListResponse>(queryKeys.patientDevices(patientId), (current) =>
        current ? { devices: current.devices.map((existing) => (existing.id === device.id ? device : existing)) } : current,
      );
    },
  });
}

export interface SuggestionDecision {
  suggestionId: string;
  decision: SuggestionDecisionRequest;
}

export function useDecideSuggestion(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestionId, decision }: SuggestionDecision) =>
      postSignedIn(queryClient, 'decideSuggestion', { params: { patientId, suggestionId }, body: decision }),
    onSuccess: ({ suggestion }) => {
      queryClient.setQueryData<SuggestionListResponse>(queryKeys.patientSuggestions(patientId), (current) =>
        current ? { suggestions: current.suggestions.map((existing) => (existing.id === suggestion.id ? suggestion : existing)) } : current,
      );
    },
  });
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
