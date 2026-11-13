import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { Button, EmptyState, NavShell } from '../ui/index.ts';
import { useMe } from './api.ts';
import { signOut, useToken } from './auth.ts';
import { BrowseIcon, PatientsIcon, SummaryIcon } from './icons.tsx';
import { LoadError } from './states.tsx';

const tabs = [
  { to: '/clinician', label: 'Summary', icon: <SummaryIcon /> },
  { to: '/clinician/patients', label: 'Patients', icon: <PatientsIcon /> },
  { to: '/clinician/browse', label: 'Browse', icon: <BrowseIcon /> },
];

export function SignOutButton() {
  const queryClient = useQueryClient();
  return (
    <Button variant="plain" onClick={() => signOut(queryClient)}>
      Sign out
    </Button>
  );
}

function SignedInShell() {
  const me = useMe();

  if (me.isPending) return null;

  if (me.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-grouped text-label">
        <LoadError onRetry={() => void me.refetch()} />
      </main>
    );
  }

  if (me.data.role === 'admin') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-grouped text-label">
        <EmptyState
          title="Clinician area"
          message="This area is for attending physicians and therapists. Administrators manage the institution without clinical detail."
          action={<SignOutButton />}
        />
      </main>
    );
  }

  return (
    <NavShell items={tabs}>
      <Outlet />
    </NavShell>
  );
}

export function ClinicianShell() {
  const token = useToken();
  if (token === null) return <Navigate to="/clinician/login" replace />;
  return <SignedInShell />;
}
