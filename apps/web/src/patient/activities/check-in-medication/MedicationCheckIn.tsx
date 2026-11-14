import { useEffect, useRef, useState } from 'react';
import {
  medicationCheckInConfigSchema,
  type ActivityModuleProps,
  type MedicationCheckIn as MedicationAnswer,
  type MedicationStatus,
  type SessionPlanItem,
} from '@tempo/shared';
import { Choices } from '../../Choices.tsx';
import { canTranscribe } from '../../recognition.ts';
import { SpokenNote } from '../../SpokenNote.tsx';

type Answer = MedicationAnswer['medications'][number];

const statuses: [MedicationStatus, string][] = [
  ['taken', 'Yes, as planned'],
  ['missed', 'I missed some'],
  ['stopped', 'I stopped taking it'],
];

const noticedWithoutNote = 'Noticed side effects';

const parseMedications = (config: SessionPlanItem['config']) => {
  const parsed = medicationCheckInConfigSchema.safeParse(config);
  if (!parsed.success) console.warn('Medication check-in config has no medication list');
  return parsed.success ? parsed.data.medications : [];
};

export function MedicationCheckIn({
  config,
  language,
  onComplete,
}: ActivityModuleProps<SessionPlanItem['config'], MedicationAnswer>) {
  const [medications] = useState(() => parseMedications(config));
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<MedicationStatus>();
  const [describing, setDescribing] = useState(false);
  const answers = useRef<Answer[]>([]);

  useEffect(() => {
    if (medications.length === 0) onComplete({ item: 'medication', medications: [] });
  }, [medications, onComplete]);

  const medication = medications[index];
  if (!medication) return null;

  const answer = (sideEffects?: string) => {
    if (!status) return;
    answers.current = [...answers.current, { ...medication, status, sideEffects }];
    if (index + 1 >= medications.length) return onComplete({ item: 'medication', medications: answers.current });
    setIndex(index + 1);
    setStatus(undefined);
    setDescribing(false);
  };

  if (!status) {
    return (
      <Choices
        title={`Did you take your ${medication.name} as planned?`}
        language={language}
        options={statuses}
        onPick={setStatus}
      />
    );
  }

  if (describing) return <SpokenNote language={language} onDone={(note) => answer(note ?? noticedWithoutNote)} />;

  return (
    <Choices
      title={`Have you noticed any side effects from ${medication.name}?`}
      language={language}
      options={[
        [false, 'No'],
        [true, 'Yes'],
      ]}
      onPick={(noticed) => {
        if (!noticed) answer();
        else if (canTranscribe()) setDescribing(true);
        else answer(noticedWithoutNote);
      }}
    />
  );
}
