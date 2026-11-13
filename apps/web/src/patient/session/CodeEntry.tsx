import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { routes, type DeviceSessionCodeResponse } from '@tempo/shared';
import { TapButton } from '../TapButton.tsx';

const codeLength = 6;
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'];

async function redeem(code: string) {
  const res = await fetch(routes.redeemSessionCode.path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Session code rejected with ${res.status}`);
  return routes.redeemSessionCode.response.parse(await res.json());
}

export function CodeEntry({ onRedeemed }: { onRedeemed: (redeemed: DeviceSessionCodeResponse) => void }) {
  const [digits, setDigits] = useState('');
  const mutation = useMutation({ mutationFn: redeem, onSuccess: onRedeemed, onError: () => setDigits('') });

  const press = (key: string) => {
    if (mutation.isPending || digits.length >= codeLength) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === codeLength) mutation.mutate(next);
  };

  const message = mutation.isPending
    ? 'Checking the code…'
    : mutation.error instanceof TypeError
      ? 'No connection. Check the internet and try again.'
      : mutation.isError
        ? 'That code did not work. Please ask your therapist for a new one.'
        : 'Your therapist will give you the code.';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6 text-[20pt]">
      <h1 className="text-center text-[32pt] font-bold">Enter your session code</h1>
      <p className="text-center" role="status">
        {message}
      </p>
      <div className="flex justify-center gap-2" aria-label={`${digits.length} of ${codeLength} digits entered`}>
        {Array.from({ length: codeLength }, (_, i) => (
          <span key={i} className="flex h-[48pt] w-[36pt] items-center justify-center rounded-xl border-2 border-neutral-400 font-mono text-[28pt]">
            {digits[i] ?? ''}
          </span>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-3">
        {keys.map((key, i) =>
          key ? (
            <TapButton key={i} variant="secondary" disabled={mutation.isPending} onTap={() => press(key)}>
              {key}
            </TapButton>
          ) : (
            <span key={i} />
          ),
        )}
        <TapButton variant="secondary" label="Delete" disabled={mutation.isPending} onTap={() => setDigits(digits.slice(0, -1))}>
          ⌫
        </TapButton>
      </div>
    </main>
  );
}
