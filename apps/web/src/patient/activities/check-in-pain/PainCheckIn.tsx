import { useState } from 'react';
import type { ActivityModuleProps, BodyRegion, Language, PainCheckIn as PainAnswer, PainType, SessionPlanItem } from '@tempo/shared';
import { BodyMap } from '../../BodyMap.tsx';
import { Choices } from '../../Choices.tsx';

const en = {
  howMuch: 'How much pain do you have right now?',
  where: 'Where does it hurt?',
  feel: 'What does the pain feel like?',
  // Faces Pain Scale, Revised (Hicks et al., 2001): six faces scored 0, 2, 4, 6, 8 and 10.
  faces: [
    [0, '😀  No pain'],
    [2, '🙂  A little'],
    [4, '😐  Some'],
    [6, '🙁  Quite a lot'],
    [8, '😣  A lot'],
    [10, '😫  The worst'],
  ] as [number, string][],
  types: [
    ['ache', 'An ache'],
    ['sharp', 'Sharp'],
    ['burning', 'Burning'],
    ['phantom-limb', 'In a limb that is no longer there'],
    [undefined, 'Not sure'],
  ] as [PainType | undefined, string][],
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    howMuch: 'Cât de tare vă doare acum?',
    where: 'Unde vă doare?',
    feel: 'Cum este durerea?',
    faces: [
      [0, '😀  Nicio durere'],
      [2, '🙂  Puțin'],
      [4, '😐  Moderat'],
      [6, '🙁  Destul de tare'],
      [8, '😣  Foarte tare'],
      [10, '😫  Cel mai rău'],
    ],
    types: [
      ['ache', 'O durere surdă'],
      ['sharp', 'Ascuțită'],
      ['burning', 'Arsură'],
      ['phantom-limb', 'Într-un membru care nu mai există'],
      [undefined, 'Nu știu'],
    ],
  },
};

export function PainCheckIn({ language, onComplete }: ActivityModuleProps<SessionPlanItem['config'], PainAnswer>) {
  const [intensity, setIntensity] = useState<number>();
  const [location, setLocation] = useState<BodyRegion>();
  const [located, setLocated] = useState(false);
  const t = copy[language];

  if (intensity === undefined) {
    return (
      <Choices
        title={t.howMuch}
        language={language}
        options={t.faces}
        onPick={(value) => (value === 0 ? onComplete({ item: 'pain', intensity: 0 }) : setIntensity(value))}
      />
    );
  }

  if (!located) {
    return (
      <BodyMap
        title={t.where}
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
      title={t.feel}
      language={language}
      options={t.types}
      onPick={(type) => onComplete({ item: 'pain', intensity, location, type })}
    />
  );
}
