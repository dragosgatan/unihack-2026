import { useLocation } from 'react-router';
import { Button } from './Button.tsx';
import { GroupedList, GroupedListRow } from './GroupedList.tsx';
import { LargeTitle } from './LargeTitle.tsx';
import { NavShell } from './NavShell.tsx';

function SummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.4-9.3C1.3 8.4 3.3 4.5 7 4.5c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.7 0 5.7 3.9 4.4 7.2C19.5 16.4 12 21 12 21Z" />
    </svg>
  );
}

function PatientsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6v1h-13v-1Z" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 13.5c2.6 0 4.5 1.8 4.5 4.5v1H17v-1c0-1.7-.5-3.2-1.4-4.3.4-.1.9-.2 1.4-.2Z" />
    </svg>
  );
}

function BrowseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

const items = [
  { to: '/ui', label: 'Summary', icon: <SummaryIcon /> },
  { to: '/ui/patients', label: 'Patients', icon: <PatientsIcon /> },
  { to: '/ui/browse', label: 'Browse', icon: <BrowseIcon /> },
];

const rows = Array.from({ length: 12 }, (_, index) => `Row ${index + 1}`);

export function NavShowcase() {
  const { pathname } = useLocation();
  const current = items.find((item) => item.to === pathname) ?? items[0];
  const title = current?.label ?? 'Summary';
  const back = current !== items[0] ? { to: '/ui', label: 'Summary' } : undefined;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-title-3 font-semibold">Navigation</h2>
      {/* A transformed ancestor becomes the containing block for fixed children, which keeps the demo's tab bar and sidebar inside the frame. */}
      <div className="relative h-128 overflow-hidden rounded-card border border-separator [transform:translateZ(0)]">
        <div className="h-full overflow-y-auto">
          <NavShell
            items={items}
            accessory={
              <button
                type="button"
                aria-label="Assistant"
                className="pressable flex size-11 items-center justify-center rounded-full bg-accent text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <MicIcon />
              </button>
            }
          >
            <LargeTitle
              title={title}
              back={back}
              actions={
                <Button variant="plain" className="px-2">
                  Edit
                </Button>
              }
            />
            <div className="px-4 pb-6">
              <GroupedList header="Scroll to collapse the title">
                {rows.map((row) => (
                  <GroupedListRow key={row} title={row} value="Value" />
                ))}
              </GroupedList>
            </div>
          </NavShell>
        </div>
      </div>
      <p className="px-1 text-footnote text-label-secondary">Tab bar below the md breakpoint, sidebar from md up. In the app both use the window instead of this frame.</p>
    </section>
  );
}
