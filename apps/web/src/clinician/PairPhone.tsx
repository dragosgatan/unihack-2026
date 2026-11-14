import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { CreatePairingCodeResponse, PairedDevice } from '@tempo/shared';
import { Button, Card, GroupedList, GroupedListRow, LargeTitle, QrCode, Sheet } from '../ui/index.ts';
import { useCreatePairingCode, usePatient, usePatientDevices, useRevokeDevice } from './api.ts';
import { formatDate, formatTime } from './format.ts';
import { groupCode, isActive, isExpired, newlyPaired, orderDevices, pairingUrl, spellDigits } from './pairing.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

const expiryTickMs = 15_000;
const pollMs = 5_000;

interface IssuedCode extends CreatePairingCodeResponse {
  knownIds: ReadonlySet<string>;
}

function deviceName(device: PairedDevice): string {
  return device.label ?? 'Phone';
}

function useNow(intervalMs: number, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, running]);
  return now;
}

function CodeDigits({ code }: { code: string }) {
  const [first, second] = groupCode(code);
  return (
    <p className="text-large-title font-semibold tabular-nums">
      <span className="sr-only select-none">Pairing code {spellDigits(code)}</span>
      <span aria-hidden="true">{first}</span>
      <span aria-hidden="true" className="ml-[0.35em]">
        {second}
      </span>
    </p>
  );
}

interface ActiveCodeProps {
  patientId: string;
  issued: IssuedCode;
  onNewCode: () => void;
  onDone: () => void;
  renewing: boolean;
}

function ActiveCode({ patientId, issued, onNewCode, onDone, renewing }: ActiveCodeProps) {
  const now = useNow(expiryTickMs, true);
  const expired = isExpired(issued.expiresAt, now);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const devices = usePatientDevices(patientId, expired || paired !== null ? false : pollMs);
  const found = paired === null && devices.data ? newlyPaired(devices.data.devices, issued.knownIds) : undefined;
  if (found) setPaired(found);
  const origin = window.location.origin;

  if (paired) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-title-2 font-semibold">Phone paired</p>
        <p className="text-subhead text-label-secondary">
          {deviceName(paired)} · paired {formatDate(paired.pairedAt)} at {formatTime(paired.pairedAt)}
        </p>
        <Button variant="secondary" className="mt-2" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-headline">This code has expired</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={onNewCode} disabled={renewing} aria-busy={renewing || undefined}>
            {renewing ? 'Creating…' : 'New code'}
          </Button>
          <Button variant="plain" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <QrCode value={pairingUrl(origin, issued.code)} label="QR code that opens the pairing link" />
      <CodeDigits code={issued.code} />
      <p className="text-subhead text-label-secondary">Valid until {formatTime(issued.expiresAt)}</p>
      <div className="flex max-w-md flex-col gap-1 text-body">
        <p>Scan with the phone's camera. Opening the link pairs the phone.</p>
        <p className="break-words text-label-secondary">
          Or open <span className="text-label">{origin}/patient/home</span> on the phone and type the code.
        </p>
      </div>
      <Button variant="plain" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function PairCard({ patientId }: { patientId: string }) {
  const create = useCreatePairingCode(patientId);
  const devices = usePatientDevices(patientId);
  const [issued, setIssued] = useState<IssuedCode | null>(null);

  function requestCode() {
    if (!devices.data) return;
    const knownIds = new Set(devices.data.devices.map((device) => device.id));
    create.mutate(undefined, { onSuccess: (response) => setIssued({ ...response, knownIds }) });
  }

  const error = create.isError ? <p className="text-subhead text-critical">Couldn't create a code. Check the connection and try again.</p> : null;

  return (
    <Card title="Pair a phone">
      {issued ? (
        <ActiveCode
          key={issued.code + issued.expiresAt}
          patientId={patientId}
          issued={issued}
          renewing={create.isPending}
          onNewCode={requestCode}
          onDone={() => {
            create.reset();
            setIssued(null);
          }}
        />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-label-secondary">The patient's own phone runs home check-ins and exercises. Pairing creates a code that works for 10 minutes.</p>
          <Button onClick={requestCode} disabled={create.isPending || !devices.data} aria-busy={create.isPending || undefined}>
            {create.isPending ? 'Creating code…' : 'Pair a phone'}
          </Button>
        </div>
      )}
      {error && <div className="mt-3">{error}</div>}
    </Card>
  );
}

function RemoveSheet({ patientId, device, open, onClose }: { patientId: string; device: PairedDevice | null; open: boolean; onClose: () => void }) {
  const revoke = useRevokeDevice(patientId);

  function confirm() {
    if (!device) return;
    revoke.mutate(device.id, { onSuccess: onClose });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Remove phone">
      <div className="flex flex-col gap-4">
        <p className="text-body">
          {device ? deviceName(device) : 'This phone'} will stop syncing with Tempo. To use it again, pair it with a new code.
        </p>
        {revoke.isError && <p className="text-subhead text-critical">Couldn't remove the phone. Check the connection and try again.</p>}
        <Button variant="destructive" fullWidth onClick={confirm} disabled={revoke.isPending} aria-busy={revoke.isPending || undefined}>
          {revoke.isPending ? 'Removing…' : 'Remove phone'}
        </Button>
        <Button variant="plain" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

function DeviceRow({ device, onRemove }: { device: PairedDevice; onRemove: () => void }) {
  const active = isActive(device);
  return (
    <GroupedListRow
      title={<span className={active ? undefined : 'text-label-secondary'}>{deviceName(device)}</span>}
      subtitle={
        <>
          <span className="block truncate">Paired {formatDate(device.pairedAt)}</span>
          {device.revokedAt !== undefined && <span className="block truncate">Revoked {formatDate(device.revokedAt)}</span>}
        </>
      }
      value={
        active ? (
          <Button variant="plain" className="px-2 text-critical" aria-label={`Remove ${deviceName(device)}`} onClick={onRemove}>
            Remove
          </Button>
        ) : undefined
      }
    />
  );
}

function PairedPhones({ patientId }: { patientId: string }) {
  const devices = usePatientDevices(patientId);
  const [removing, setRemoving] = useState<PairedDevice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (devices.isPending) return <LoadingSkeleton rows={2} />;
  if (devices.isError) return <LoadError onRetry={() => void devices.refetch()} />;

  const ordered = orderDevices(devices.data.devices);

  return (
    <>
      <GroupedList header="Paired phones">
        {ordered.length === 0 ? (
          <GroupedListRow title={<span className="text-label-secondary">No phones paired yet</span>} />
        ) : (
          ordered.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              onRemove={() => {
                setRemoving(device);
                setSheetOpen(true);
              }}
            />
          ))
        )}
      </GroupedList>
      <RemoveSheet key={removing?.id ?? 'none'} patientId={patientId} device={removing} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function PairPhoneBody({ patientId }: { patientId: string }) {
  const patient = usePatient(patientId);
  return (
    <main>
      <LargeTitle title="Home phone" back={{ to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' }} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        <PairCard patientId={patientId} />
        <PairedPhones patientId={patientId} />
      </div>
    </main>
  );
}

export function PairPhone() {
  const { patientId = '' } = useParams();
  return <PairPhoneBody key={patientId} patientId={patientId} />;
}
