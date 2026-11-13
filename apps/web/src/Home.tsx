import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { healthResponseSchema, type HealthResponse } from '@tempo/shared';

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}

export function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold">Tempo</h1>
      <nav className="mt-4 flex flex-col gap-2">
        <Link to="/patient">Patient</Link>
        <Link to="/clinician">Clinician</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <p className="mt-4">API: {health.data?.status ?? (health.isError ? 'unreachable' : 'checking')}</p>
    </main>
  );
}
