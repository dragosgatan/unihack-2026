import { useState } from 'react';
import type { ActivityModuleProps, BodyRegion, PainCheckIn as PainAnswer, PainType, SessionPlanItem } from '@tempo/shared';
import { BodyMap } from '../../BodyMap.tsx';
import { Choices } from '../../Choices.tsx';

// Faces Pain Scale, Revised (Hicks et al., 2001): six faces scored 0, 2, 4, 6, 8 and 10.
const faces: [number, string][] = [
  [0, '😀  No pain'],
  [2, '🙂  A little'],
  [4, '😐  Some'],
  [6, '🙁  Quite a lot'],
  [8, '😣  A lot'],
  [10, '😫  The worst'],
];

const types: [PainType | undefined, string][] = [
  ['ache', 'An ache'],
  ['sharp', 'Sharp'],
  ['burning', 'Burning'],
  ['phantom-limb', 'In a limb that is no longer there'],
  [undefined, 'Not sure'],
];

export function PainCheckIn({ language, onComplete }: ActivityModuleProps<SessionPlanItem['config'], PainAnswer>) {
  const [intensity, setIntensity] = useState<number>();
  const [location, setLocation] = useState<BodyRegion>();
  const [located, setLocated] = useState(false);

  if (intensity === undefined) {
    return (
      <Choices
        title="How much pain do you have right now?"
        language={language}
        options={faces}
        onPick={(value) => (value === 0 ? onComplete({ item: 'pain', intensity: 0 }) : setIntensity(value))}
      />
    );
  }

  if (!located) {
    return (
      <BodyMap
        title="Where does it hurt?"
        language={language}
        onPick={(region) => {
          setLocation(region);
          setLocated(true);
        }}
      />
    );
  }

  return (
    <Choices
      title="What does the pain feel like?"
      language={language}
      options={types}
      onPick={(type) => onComplete({ item: 'pain', intensity, location, type })}
    />
  );
}
