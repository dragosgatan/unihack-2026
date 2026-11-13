import { useParams } from 'react-router';
import { metricDefinitions, metricIds } from '@tempo/shared';
import { EmptyState, GroupedList, GroupedListRow, LargeTitle } from '../ui/index.ts';
import { domainLabels, domains, domainTints, isDomain, metricDomains, type Domain } from './domains.ts';
import { DomainIcon } from './icons.tsx';
import { metricNames } from './metricNames.ts';

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
            <GroupedListRow key={metricId} title={metricNames[metricId]} value={metricDefinitions[metricId].unit} />
          ))}
        </GroupedList>
      </div>
    </main>
  );
}
