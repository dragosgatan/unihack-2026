import { useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { AiProvenance, Suggestion, SuggestionEvidence } from '@tempo/shared';
import { Badge, Button, Card, GroupedList, GroupedListRow, Sheet, TextArea } from '../ui/index.ts';
import { ChevronRightIcon } from '../ui/icons.tsx';
import { useDecideSuggestion, usePatientSuggestions } from './api.ts';
import { formatDate } from './format.ts';
import { ExternalLinkIcon, SparkleIcon } from './icons.tsx';
import { LoadError } from './states.tsx';
import { canSaveEdit, evidenceLabel, evidenceTarget, groupSuggestions, kindLabels } from './suggestions.ts';

export function SuggestionHeader({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex items-center gap-1.5 text-subhead font-semibold text-accent">
        <span className="size-4 shrink-0 [&>svg]:size-full">
          <SparkleIcon />
        </span>
        Suggested by Tempo AI
      </span>
      <Badge>{kindLabels[suggestion.kind]}</Badge>
      <span className="ml-auto text-footnote text-label-secondary">{formatDate(suggestion.createdAt)}</span>
    </div>
  );
}

function EvidenceRow({ patientId, evidence }: { patientId: string; evidence: SuggestionEvidence }) {
  const target = evidenceTarget(patientId, evidence);
  const text = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="break-words text-subhead">{evidenceLabel(evidence)}</span>
      {evidence.t !== undefined && <span className="text-footnote text-label-secondary">{formatDate(evidence.t)}</span>}
    </span>
  );
  const rowClass = 'flex min-h-11 items-center gap-3 py-2';
  const linkClass = `${rowClass} rounded-control text-label active:opacity-60 focus-visible:outline-2 focus-visible:outline-accent`;

  if (target.kind === 'internal') {
    return (
      <Link to={target.to} className={linkClass}>
        {text}
        <ChevronRightIcon className="h-3.5 w-2 shrink-0 text-label-tertiary" />
      </Link>
    );
  }
  if (target.kind === 'external') {
    return (
      <a href={target.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {text}
        <span className="sr-only">(opens in a new tab)</span>
        <span className="size-4 shrink-0 text-label-tertiary [&>svg]:size-full">
          <ExternalLinkIcon />
        </span>
      </a>
    );
  }
  return <div className={rowClass}>{text}</div>;
}

export function EvidenceList({ patientId, evidence }: { patientId: string; evidence: readonly SuggestionEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-footnote text-label-secondary">Based on</h3>
      <ul className="mt-1 flex flex-col">
        {evidence.map((item, index) => (
          <li key={`${item.label}-${index}`} className="border-b border-separator last:border-b-0">
            <EvidenceRow patientId={patientId} evidence={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Provenance({ ai }: { ai: AiProvenance }) {
  return (
    <p className="mt-2 break-words text-caption text-label-tertiary">
      Model {ai.model} · prompt {ai.promptVersion}
    </p>
  );
}

type QuickDecision = 'accepted' | 'dismissed';

function SuggestionCard({ patientId, suggestion, onEdit }: { patientId: string; suggestion: Suggestion; onEdit: () => void }) {
  const decide = useDecideSuggestion(patientId);
  const pendingStatus = decide.isPending ? decide.variables.decision.status : null;

  function send(status: QuickDecision) {
    decide.mutate({ suggestionId: suggestion.id, decision: { status } });
  }

  function label(status: QuickDecision, idle: string) {
    return pendingStatus === status ? 'Saving…' : idle;
  }

  return (
    <Card>
      <article aria-busy={decide.isPending || undefined}>
        <SuggestionHeader suggestion={suggestion} />
        <p className="mt-2 text-body">{suggestion.text}</p>
        <EvidenceList patientId={patientId} evidence={suggestion.evidence} />
        <Provenance ai={suggestion.ai} />
        <div className="mt-4 grid grid-cols-3 gap-2 [&>button]:px-2">
          <Button variant="secondary" disabled={decide.isPending} onClick={() => send('accepted')}>
            {label('accepted', 'Accept')}
          </Button>
          <Button variant="secondary" disabled={decide.isPending} onClick={onEdit}>
            Edit
          </Button>
          <Button variant="secondary" disabled={decide.isPending} onClick={() => send('dismissed')}>
            {label('dismissed', 'Dismiss')}
          </Button>
        </div>
        {decide.isError ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-subhead text-critical">Couldn't save your decision.</span>
            <Button variant="plain" className="px-2" onClick={() => decide.mutate(decide.variables)}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-footnote text-label-secondary">Your decision is recorded. Nothing else in the record or plan changes.</p>
        )}
      </article>
    </Card>
  );
}

interface EditSheetProps {
  suggestion: Suggestion | null;
  open: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  decide: ReturnType<typeof useDecideSuggestion>;
  onClose: () => void;
}

function EditSuggestionSheet({ suggestion, open, draft, onDraftChange, decide, onClose }: EditSheetProps) {
  const saveable = suggestion !== null && canSaveEdit(draft, suggestion.text) && !decide.isPending;

  function save() {
    if (!suggestion || !saveable) return;
    decide.mutate({ suggestionId: suggestion.id, decision: { status: 'edited', editedText: draft.trim() } }, { onSuccess: onClose });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit suggestion"
      action={
        <Button variant="plain" className="px-2" disabled={!saveable} aria-busy={decide.isPending || undefined} onClick={save}>
          {decide.isPending ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <TextArea
        label="Suggestion text"
        hint="The original text from Tempo AI is kept with your edit."
        rows={8}
        maxLength={2000}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        error={decide.isError ? "Couldn't save the edit. Check the connection and tap Save again." : undefined}
      />
    </Sheet>
  );
}

export function Suggestions({ patientId }: { patientId: string }) {
  const suggestions = usePatientSuggestions(patientId);
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const edit = useDecideSuggestion(patientId);

  if (suggestions.isPending) return null;
  if (suggestions.isError) {
    return (
      <section className="flex max-w-3xl flex-col gap-2">
        <h2 className="text-title-3 font-semibold">Suggestions</h2>
        <LoadError onRetry={() => void suggestions.refetch()} />
      </section>
    );
  }
  if (suggestions.data.suggestions.length === 0) return null;

  const { open, past } = groupSuggestions(suggestions.data.suggestions);

  function startEdit(suggestion: Suggestion) {
    edit.reset();
    setEditing(suggestion);
    setDraft(suggestion.text);
    setSheetOpen(true);
  }

  return (
    <section className="flex max-w-3xl flex-col gap-2">
      <h2 className="text-title-3 font-semibold">Suggestions</h2>
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {open.map((suggestion) => (
            <motion.div
              key={suggestion.id}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="-mx-2 -mt-2 overflow-hidden px-2 pt-2 pb-3"
            >
              <SuggestionCard patientId={patientId} suggestion={suggestion} onEdit={() => startEdit(suggestion)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {past.length > 0 && (
          <GroupedList>
            <GroupedListRow title="See past suggestions" value={past.length} chevron href={`/clinician/patients/${patientId}/suggestions`} />
          </GroupedList>
        )}
      </div>
      <EditSuggestionSheet
        suggestion={editing}
        open={sheetOpen}
        draft={draft}
        onDraftChange={setDraft}
        decide={edit}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
