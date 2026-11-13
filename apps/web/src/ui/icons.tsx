import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M1.5 1.5 6.5 7l-5 5.5" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 14 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M1.5 1.5 7 6.5l5.5-5" />
    </svg>
  );
}
