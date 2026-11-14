import { useParams } from 'react-router';
import type { Suggestion } from '@tempo/shared';
import { Badge, Card, EmptyState, LargeTitle } from '../ui/index.ts';
import { usePatient, usePatientSuggestions } from './api.ts';
import { formatDate } from './format.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';
import { EvidenceList, Provenance, SuggestionHeader } from './Suggestions.tsx';
import { newestFirst, outcomeLabels, outcomeTones } from './suggestions.ts';

function PastSuggestionCard({ patientId, suggestion }: { patientId: string; suggestion: Suggestion }) {
  const edited = suggestion.status === 'edited' && suggestion.editedText !== undefined;
  return (
    <Card>
      <article>
        <SuggestionHeader suggestion={suggestion} />
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={outcomeTones[suggestion.status]}>{outcomeLabels[suggestion.status]}</Badge>
          {suggestion.decidedAt !== undefined && <span className="text-footnote text-label-secondary">{formatDate(suggestion.decidedAt)}</span>}
        </p>
        {edited ? (
          <>
            <h3 className="mt-3 text-footnote text-label-secondary">Edited text</h3>
            <p className="mt-1 text-body">{suggestion.editedText}</p>
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-subhead text-accent">Original from Tempo AI</summary>
              <p className="text-body text-label-secondary">{suggestion.text}</p>
            </details>
          </>
        ) : (
          <p className="mt-3 text-body">{suggestion.text}</p>
        )}
        <EvidenceList patientId={patientId} evidence={suggestion.evidence} />
        <Provenance ai={suggestion.ai} />
      </article>
    </Card>
  );
}

function SuggestionsHistoryBody({ patientId }: { patientId: string }) {
  const patient = usePatient(patientId);
  const suggestions = usePatientSuggestions(patientId);

  return (
    <main>
      <LargeTitle title="Suggestions" back={{ to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' }} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-3 px-4 pb-8">
        {suggestions.isPending && <LoadingSkeleton rows={3} />}
        {suggestions.isError && <LoadError onRetry={() => void suggestions.refetch()} />}
        {suggestions.isSuccess && suggestions.data.suggestions.length === 0 && (
          <EmptyState title="No suggestions" message="Suggestions from Tempo AI appear here." />
        )}
        {suggestions.isSuccess &&
          newestFirst(suggestions.data.suggestions).map((suggestion) => (
            <PastSuggestionCard key={suggestion.id} patientId={patientId} suggestion={suggestion} />
          ))}
      </div>
    </main>
  );
}

export function SuggestionsHistory() {
  const { patientId = '' } = useParams();
  return <SuggestionsHistoryBody key={patientId} patientId={patientId} />;
}
