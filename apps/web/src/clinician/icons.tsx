import type { ReactNode } from 'react';
import type { Domain } from './domains.ts';

export function SummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.4-9.3C1.3 8.4 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.7 0 5.7 3.9 4.4 7.2C19.5 16.4 12 21 12 21Z" />
    </svg>
  );
}

export function PatientsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6v1h-13v-1Z" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 13.5c2.6 0 4.5 1.8 4.5 4.5v1H17v-1c0-1.7-.5-3.2-1.4-4.3.4-.1.9-.2 1.4-.2Z" />
    </svg>
  );
}

export function BrowseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function StrokeIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const domainIcons: Record<Domain, ReactNode> = {
  memory: (
    <StrokeIcon>
      <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V6a2 2 0 0 0-3-2Z" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />
    </StrokeIcon>
  ),
  attention: (
    <StrokeIcon>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </StrokeIcon>
  ),
  executive: (
    <StrokeIcon>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6" />
    </StrokeIcon>
  ),
  motor: (
    <StrokeIcon>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 11a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2l-2.3-3.2a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </StrokeIcon>
  ),
  mobility: (
    <StrokeIcon>
      <circle cx="13" cy="4.5" r="1.5" />
      <path d="m9 20 3-6 3 3v4" />
      <path d="m6 12 3-4 4 1 3 3h3" />
      <path d="m12 14-1-5" />
    </StrokeIcon>
  ),
  'check-in': (
    <StrokeIcon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="m9 13 2 2 4-4" />
    </StrokeIcon>
  ),
};

export function DomainIcon({ domain }: { domain: Domain }) {
  return domainIcons[domain];
}

export function MetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.3 6.3-5.6 5.6-2.9-2.9-1.4 1.4 4.3 4.3 7-7-1.4-1.4Z" />
    </svg>
  );
}

export function NotYetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function SkippedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 17.5 17.5 6.5" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 2.5c.4 4.6 2.9 7.1 7.5 7.5-4.6.4-7.1 2.9-7.5 7.5-.4-4.6-2.9-7.1-7.5-7.5 4.6-.4 7.1-2.9 7.5-7.5Z" />
      <path d="M18.5 14c.2 2.3 1.2 3.3 3.5 3.5-2.3.2-3.3 1.2-3.5 3.5-.2-2.3-1.2-3.3-3.5-3.5 2.3-.2 3.3-1.2 3.5-3.5Z" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 16 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}
