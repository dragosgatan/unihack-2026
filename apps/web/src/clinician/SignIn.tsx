import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { GroupedList, GroupedListRow, LargeTitle } from '../ui/index.ts';
import { signIn } from './auth.ts';

const demoAccounts = [
  { token: 'mock-attending', label: 'Attending physician' },
  { token: 'mock-therapist', label: 'Therapist' },
  { token: 'mock-admin', label: 'Administrator' },
];

export function SignIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  function choose(token: string) {
    signIn(queryClient, token);
    navigate('/clinician', { replace: true });
  }

  return (
    <main className="min-h-dvh bg-grouped text-label">
      <LargeTitle title="Sign in" />
      <div className="flex max-w-xl flex-col gap-6 px-4 pb-8">
        <p className="px-4 text-subhead text-label-secondary">This is the demo sign-in. Pick an account to continue.</p>
        <GroupedList header="Demo accounts">
          {demoAccounts.map((account) => (
            <GroupedListRow key={account.token} title={account.label} chevron onPress={() => choose(account.token)} />
          ))}
        </GroupedList>
      </div>
    </main>
  );
}
