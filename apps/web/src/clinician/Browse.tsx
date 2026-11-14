import { useParams } from 'react-router';
import { metricDefinitions, metricIdSchema, metricIds, type MetricId } from '@tempo/shared';
import { EmptyState, GroupedList, GroupedListRow, LargeTitle } from '../ui/index.ts';
import { usePatients } from './api.ts';
import { domainLabels, domains, domainTints, isDomain, metricDomains, type Domain } from './domains.ts';
import { DomainIcon } from './icons.tsx';
import { profileLabels } from './format.ts';
import { metricNames } from './metricNames.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

function metricsIn(domain: Domain) {
  return metricIds.filter((metricId) => metricDomains[metricId] === domain);
}

export function Browse() {
  return (
    <main>
      <LargeTitle title="Browse" />
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        <GroupedList header="Domains">
          {domains.map((domain) => {
            const count = metricsIn(domain).length;
            return (
              <GroupedListRow
                key={domain}
                title={domainLabels[domain]}
                subtitle={`${count} ${count === 1 ? 'metric' : 'metrics'}`}
                icon={<DomainIcon domain={domain} />}
                iconTint={domainTints[domain]}
                chevron
                href={`/clinician/browse/${domain}`}
              />
            );
          })}
        </GroupedList>
      </div>
    </main>
  );
}

export function BrowseDomain() {
  const { domain } = useParams();

  if (!isDomain(domain)) {
    return (
      <main>
        <LargeTitle title="Browse" back={{ to: '/clinician/browse', label: 'Browse' }} />
        <EmptyState title="Domain not found" message="Go back to Browse and pick a domain." />
      </main>
    );
  }

  return (
    <main>
      <LargeTitle title={domainLabels[domain]} back={{ to: '/clinician/browse', label: 'Browse' }} />
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        <GroupedList header="Metrics">
          {metricsIn(domain).map((metricId) => (
            <GroupedListRow
              key={metricId}
              title={metricNames[metricId]}
              value={metricDefinitions[metricId].unit}
              chevron
              href={`/clinician/browse/${domain}/${metricId}`}
            />
          ))}
        </GroupedList>
      </div>
    </main>
  );
}

function PatientPicker({ metricId }: { metricId: MetricId }) {
  const patients = usePatients();

  if (patients.isPending) return <LoadingSkeleton rows={4} />;
  if (patients.isError) return <LoadError onRetry={() => void patients.refetch()} />;
  if (patients.data.patients.length === 0) {
    return <EmptyState title="No patients yet" message="Patients assigned to you will appear here." />;
  }

  return (
    <GroupedList header="Choose a patient">
      {[...patients.data.patients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((patient) => (
          <GroupedListRow
            key={patient.id}
            title={patient.name}
            subtitle={profileLabels[patient.profile]}
            chevron
            href={`/clinician/patients/${patient.id}/metrics/${metricId}?from=browse`}
          />
        ))}
    </GroupedList>
  );
}

export function BrowseMetric() {
  const { domain, metricId } = useParams();
  const parsed = metricIdSchema.safeParse(metricId);

  if (!isDomain(domain) || !parsed.success) {
    return (
      <main>
        <LargeTitle title="Browse" back={{ to: '/clinician/browse', label: 'Browse' }} />
        <EmptyState title="Metric not found" message="Go back to Browse and pick a metric." />
      </main>
    );
  }

  return (
    <main>
      <LargeTitle title={metricNames[parsed.data]} back={{ to: `/clinician/browse/${domain}`, label: domainLabels[domain] }} />
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        <PatientPicker metricId={parsed.data} />
      </div>
    </main>
  );
}
