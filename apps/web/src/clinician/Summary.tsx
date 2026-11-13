import { useNavigate } from 'react-router';
import { Card, EmptyState, LargeTitle } from '../ui/index.ts';
import { useMe, usePatients } from './api.ts';
import { ageFrom, profileLabels } from './format.ts';
import { SignOutButton } from './Shell.tsx';
import { LoadError, LoadingSkeleton } from './states.tsx';

function YourPatients() {
  const navigate = useNavigate();
  const patients = usePatients();

  if (patients.isPending) return <LoadingSkeleton />;
  if (patients.isError) return <LoadError onRetry={() => void patients.refetch()} />;
  if (patients.data.patients.length === 0) {
    return <EmptyState title="No patients yet" message="Patients assigned to you will appear here." />;
  }

  const sorted = [...patients.data.patients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((patient) => (
        <Card key={patient.id} title={patient.name} onPress={() => navigate(`/clinician/patients/${patient.id}`)}>
          <span className="text-footnote text-label-secondary">
            {profileLabels[patient.profile]} · {ageFrom(patient.dateOfBirth)} years
          </span>
        </Card>
      ))}
    </div>
  );
}

export function Summary() {
  const me = useMe();

  return (
    <main>
      <LargeTitle title="Summary" actions={<SignOutButton />} />
      <div className="flex flex-col gap-6 px-4 pb-8">
        {me.data !== undefined && <p className="text-subhead text-label-secondary">Hello, {me.data.name}.</p>}
        <section className="flex flex-col gap-2">
          <h2 className="text-title-3 font-semibold">Your patients</h2>
          <YourPatients />
        </section>
      </div>
    </main>
  );
}
