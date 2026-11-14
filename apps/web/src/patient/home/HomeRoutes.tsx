import { useCallback, useState } from 'react';
import { Route, Routes, useSearchParams } from 'react-router';
import { DigitEntry } from '../DigitEntry.tsx';
import { Screen } from '../Screen.tsx';
import { CodeEntry } from '../session/CodeEntry.tsx';
import { SessionRunner } from '../session/SessionRunner.tsx';
import { TapButton } from '../TapButton.tsx';
import { pairDevice } from './api.ts';
import { forgetDevice, homePath, loadDevice, loadHomeData, pinHash, recordFinished, saveDevice, saveHomeData, type HomeDevice } from './data.ts';
import { DueToday } from './DueToday.tsx';
import { InstallPrompt } from './InstallPrompt.tsx';
import { LogEpisode } from './LogEpisode.tsx';

const pinLength = 4;

const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);

function ChoosePin({ device, onChosen }: { device: HomeDevice; onChosen: (pin: string) => void }) {
  const [first, setFirst] = useState<string>();
  const [mismatch, setMismatch] = useState(false);

  if (first === undefined) {
    return (
      <DigitEntry
        key="first"
        title="Choose a 4-digit PIN"
        message={mismatch ? 'Those did not match. Please choose a PIN again.' : `Hello, ${device.patientFirstName}. You will use this PIN to open Tempo.`}
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
      title="Enter the PIN again"
      message="So we know it is right."
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

  if (forgot) {
    return (
      <Screen
        title="Forgot your PIN?"
        text="Ask your therapist for a new pairing code, then pair this phone again. Your results are kept."
        language={device.language}
        action={<TapButton onTap={onForgot}>Pair again</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => setForgot(false)}>
            Back
          </TapButton>
        }
      />
    );
  }

  // shortcut: no lockout after wrong PINs; the PIN only guards the screen on the patient's own phone, add a lockout if devices are shared.
  return (
    <DigitEntry
      key={attempt}
      title={`Hello, ${device.patientFirstName}`}
      message={attempt ? 'That PIN did not match. Please try again.' : 'Enter your PIN.'}
      language={device.language}
      length={pinLength}
      masked
      onEntered={(pin) => {
        pinHash(device.deviceId, pin).then((hash) => (hash === device.pinHash ? onUnlocked() : setAttempt((n) => n + 1)), console.error);
      }}
      secondary={
        <TapButton variant="secondary" onTap={() => setForgot(true)}>
          I forgot my PIN
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

  const keep = (next: HomeDevice) => {
    saveDevice(next);
    setDevice(next);
  };

  const unpair = useCallback(() => {
    forgetDevice();
    setDevice(undefined);
    setUnlocked(false);
  }, []);

  if (!device) {
    return <CodeEntry title="Enter your pairing code" initialCode={params.get('code') ?? undefined} redeem={pairDevice} onRedeemed={keep} />;
  }

  if (!device.pinHash) {
    return (
      <ChoosePin
        device={device}
        onChosen={(pin) => {
          pinHash(device.deviceId, pin).then((hash) => {
            keep({ ...device, pinHash: hash });
            setUnlocked(true);
            setAskInstall(!isInstalled());
          }, console.error);
        }}
      />
    );
  }

  if (!unlocked) return <Unlock device={device} onUnlocked={() => setUnlocked(true)} onForgot={unpair} />;

  if (askInstall) return <InstallPrompt language={device.language} onDone={() => setAskInstall(false)} />;

  return (
    <Routes>
      <Route index element={<DueToday device={device} onUnpaired={unpair} />} />
      <Route
        path="session"
        element={<SessionRunner exitTo={homePath} onFinish={(results, at) => saveHomeData(recordFinished(loadHomeData(), results, at))} />}
      />
      <Route path="episode" element={<LogEpisode device={device} />} />
    </Routes>
  );
}
