import { useCallback, useEffect, useState } from 'react';
import type { Language } from '@tempo/shared';
import { Route, Routes, useSearchParams } from 'react-router';
import { DigitEntry } from '../DigitEntry.tsx';
import { warmPoseAssetsInBackground } from '../pose/assets.ts';
import { Screen } from '../Screen.tsx';
import { CodeEntry } from '../session/CodeEntry.tsx';
import { SessionRunner } from '../session/SessionRunner.tsx';
import { TapButton } from '../TapButton.tsx';
import { pairDevice } from './api.ts';
import {
  forgetDevice,
  homePath,
  isInstalled,
  loadDevice,
  loadHomeData,
  pinHash,
  recordFinished,
  saveDevice,
  saveHomeData,
  storageSplitOnInstall,
  type HomeDevice,
} from './data.ts';
import { DueToday } from './DueToday.tsx';
import { InstallFirst, InstallPrompt } from './InstallPrompt.tsx';
import { LogEpisode } from './LogEpisode.tsx';

const pinLength = 4;

const en = {
  pairTitle: 'Enter your pairing code',
  choose: 'Choose a 4-digit PIN',
  mismatch: 'Those did not match. Please choose a PIN again.',
  hello: (name: string) => `Hello, ${name}`,
  use: (name: string) => `Hello, ${name}. You will use this PIN to open Tempo.`,
  again: 'Enter the PIN again',
  sure: 'So we know it is right.',
  forgotTitle: 'Forgot your PIN?',
  forgotText: 'Ask your therapist for a new pairing code, then pair this phone again. Your results are kept.',
  pairAgain: 'Pair again',
  back: 'Back',
  wrong: 'That PIN did not match. Please try again.',
  enter: 'Enter your PIN.',
  forgot: 'I forgot my PIN',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    pairTitle: 'Introduceți codul de asociere',
    choose: 'Alegeți un PIN din 4 cifre',
    mismatch: 'Nu s-au potrivit. Vă rugăm să alegeți din nou un PIN.',
    hello: (name) => `Bună ziua, ${name}`,
    use: (name) => `Bună ziua, ${name}. Veți folosi acest PIN ca să deschideți Tempo.`,
    again: 'Introduceți PIN-ul din nou',
    sure: 'Ca să știm că este corect.',
    forgotTitle: 'Ați uitat PIN-ul?',
    forgotText: 'Cereți terapeutului un cod nou de asociere, apoi asociați din nou telefonul. Rezultatele rămân păstrate.',
    pairAgain: 'Asociază din nou',
    back: 'Înapoi',
    wrong: 'PIN-ul nu s-a potrivit. Vă rugăm să încercați din nou.',
    enter: 'Introduceți PIN-ul.',
    forgot: 'Am uitat PIN-ul',
  },
};

function ChoosePin({ device, onChosen }: { device: HomeDevice; onChosen: (pin: string) => void }) {
  const [first, setFirst] = useState<string>();
  const [mismatch, setMismatch] = useState(false);
  const t = copy[device.language];

  if (first === undefined) {
    return (
      <DigitEntry
        key="first"
        title={t.choose}
        message={mismatch ? t.mismatch : t.use(device.patientFirstName)}
        language={device.language}
        length={pinLength}
        masked
        onEntered={setFirst}
      />
    );
  }

  return (
    <DigitEntry
      key="again"
      title={t.again}
      message={t.sure}
      language={device.language}
      length={pinLength}
      masked
      onEntered={(pin) => {
        if (pin === first) return onChosen(pin);
        setFirst(undefined);
        setMismatch(true);
      }}
    />
  );
}

function Unlock({ device, onUnlocked, onForgot }: { device: HomeDevice; onUnlocked: () => void; onForgot: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [forgot, setForgot] = useState(false);
  const t = copy[device.language];

  if (forgot) {
    return (
      <Screen
        title={t.forgotTitle}
        text={t.forgotText}
        language={device.language}
        action={<TapButton onTap={onForgot}>{t.pairAgain}</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => setForgot(false)}>
            {t.back}
          </TapButton>
        }
      />
    );
  }

  // shortcut: no lockout after wrong PINs; the PIN only guards the screen on the patient's own phone, add a lockout if devices are shared.
  return (
    <DigitEntry
      key={attempt}
      title={t.hello(device.patientFirstName)}
      message={attempt ? t.wrong : t.enter}
      language={device.language}
      length={pinLength}
      masked
      onEntered={(pin) => {
        pinHash(device.deviceId, pin).then((hash) => (hash === device.pinHash ? onUnlocked() : setAttempt((n) => n + 1)), console.error);
      }}
      secondary={
        <TapButton variant="secondary" onTap={() => setForgot(true)}>
          {t.forgot}
        </TapButton>
      }
    />
  );
}

export function HomeRoutes() {
  const [params] = useSearchParams();
  const [device, setDevice] = useState(loadDevice);
  const [unlocked, setUnlocked] = useState(false);
  const [askInstall, setAskInstall] = useState(false);
  const [stayInBrowser, setStayInBrowser] = useState(false);

  const keep = (next: HomeDevice) => {
    saveDevice(next);
    setDevice(next);
  };

  const paired = device !== undefined;
  useEffect(() => {
    if (paired) warmPoseAssetsInBackground();
  }, [paired]);

  const unpair = useCallback(() => {
    forgetDevice();
    setDevice(undefined);
    setUnlocked(false);
  }, []);

  if (!device && storageSplitOnInstall() && !stayInBrowser) {
    return <InstallFirst code={params.get('code') ?? ''} onStay={() => setStayInBrowser(true)} />;
  }

  if (!device) {
    return (
      <CodeEntry
        title={{ en: en.pairTitle, ro: copy.ro.pairTitle }}
        initialCode={params.get('code') ?? undefined}
        redeem={pairDevice}
        onRedeemed={(paired, chosen) => keep(chosen ? { ...paired, language: chosen } : paired)}
      />
    );
  }

  if (!device.pinHash) {
    return (
      <ChoosePin
        device={device}
        onChosen={(pin) => {
          pinHash(device.deviceId, pin).then((hash) => {
            keep({ ...device, pinHash: hash });
            setUnlocked(true);
            setAskInstall(!isInstalled() && !storageSplitOnInstall());
          }, console.error);
        }}
      />
    );
  }

  if (!unlocked) return <Unlock device={device} onUnlocked={() => setUnlocked(true)} onForgot={unpair} />;

  if (askInstall) return <InstallPrompt language={device.language} onDone={() => setAskInstall(false)} />;

  return (
    <Routes>
      <Route index element={<DueToday device={device} onChange={keep} onUnpaired={unpair} />} />
      <Route
        path="session"
        element={<SessionRunner exitTo={homePath} onFinish={(results, at) => saveHomeData(recordFinished(loadHomeData(), results, at))} />}
      />
      <Route path="episode" element={<LogEpisode device={device} />} />
    </Routes>
  );
}
