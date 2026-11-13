import type { ActivityId, ActivityModuleProps } from '@tempo/shared';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';

export function Placeholder({ config, language, onComplete }: ActivityModuleProps<{ activityId: ActivityId }, undefined>) {
  return (
    <Screen
      title={config.activityId}
      text="This activity is not ready yet. Tap Done to move on."
      language={language}
      action={<TapButton onTap={() => onComplete(undefined)}>Done</TapButton>}
    />
  );
}
