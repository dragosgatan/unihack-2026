import { useState } from 'react';
import { profileSchema, type PatientSummary, type Profile } from '@tempo/shared';
import { EmptyState, GroupedList, GroupedListRow, LargeTitle, TextField } from '../ui/index.ts';
import { usePatients } from './api.ts';
import { ageFrom, normalizeForSearch, profileLabels, sexLabels } from './format.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

function groupByProfile(patients: PatientSummary[]): [Profile, PatientSummary[]][] {
  return profileSchema.options
    .map((profile): [Profile, PatientSummary[]] => [
      profile,
      patients.filter((patient) => patient.profile === profile).sort((a, b) => a.name.localeCompare(b.name)),
    ])
    .filter(([, group]) => group.length > 0);
}

function PatientGroups({ search }: { search: string }) {
  const patients = usePatients();

  if (patients.isPending) return <LoadingSkeleton rows={5} />;
  if (patients.isError) return <LoadError onRetry={() => void patients.refetch()} />;
  if (patients.data.patients.length === 0) {
    return <EmptyState title="No patients yet" message="Patients assigned to you will appear here." />;
  }

  const needle = normalizeForSearch(search.trim());
  const matches = patients.data.patients.filter((patient) => normalizeForSearch(patient.name).includes(needle));
  if (matches.length === 0) return <EmptyState title="No patients match" message="Try a different name." />;

  return groupByProfile(matches).map(([profile, group]) => (
    <GroupedList key={profile} header={profileLabels[profile]}>
      {group.map((patient) => (
        <GroupedListRow
          key={patient.id}
          title={patient.name}
          subtitle={`${ageFrom(patient.dateOfBirth)} years · ${sexLabels[patient.sex]}`}
          chevron
          href={`/clinician/patients/${patient.id}`}
        />
      ))}
    </GroupedList>
  ));
}

export function Patients() {
  const [search, setSearch] = useState('');

  return (
    <main>
      <LargeTitle title="Patients" />
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        <TextField label="Search" type="search" placeholder="Name" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <PatientGroups search={search} />
      </div>
    </main>
  );
}
