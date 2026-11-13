import { useEffect, useState } from 'react';
import { Button, EmptyState } from '../ui/index.ts';

const skeletonDelayMs = 300;

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 rounded-card bg-fill motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Couldn't load this"
      message="Check the connection and try again."
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
