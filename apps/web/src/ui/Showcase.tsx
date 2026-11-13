import { useState, type ReactNode } from 'react';
import { Badge } from './Badge.tsx';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { EmptyState } from './EmptyState.tsx';
import { GroupedList, GroupedListRow, type RowTint } from './GroupedList.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';
import { Select } from './Select.tsx';
import { TextArea } from './TextArea.tsx';
import { TextField } from './TextField.tsx';
import { Toggle } from './Toggle.tsx';
import { ChevronRightIcon } from './icons.tsx';

type Range = 'W' | 'M' | '6M' | 'Y';

const ranges = [
  { value: 'W', label: 'W' },
  { value: 'M', label: 'M' },
  { value: '6M', label: '6M' },
  { value: 'Y', label: 'Y' },
] as const satisfies readonly { value: Range; label: string }[];

const swatches = [
  { name: 'grouped', className: 'bg-grouped' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-elevated', className: 'bg-surface-elevated' },
  { name: 'fill', className: 'bg-fill' },
  { name: 'separator', className: 'bg-separator' },
  { name: 'segment-selected', className: 'bg-segment-selected' },
  { name: 'label', className: 'bg-label' },
  { name: 'label-secondary', className: 'bg-label-secondary' },
  { name: 'label-tertiary', className: 'bg-label-tertiary' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'accent-pressed', className: 'bg-accent-pressed' },
  { name: 'accent-soft', className: 'bg-accent-soft' },
  { name: 'on-accent', className: 'bg-on-accent' },
  { name: 'positive', className: 'bg-positive' },
  { name: 'positive-soft', className: 'bg-positive-soft' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'warning-soft', className: 'bg-warning-soft' },
  { name: 'critical', className: 'bg-critical' },
  { name: 'critical-soft', className: 'bg-critical-soft' },
  { name: 'cat-memory', className: 'bg-cat-memory' },
  { name: 'cat-attention', className: 'bg-cat-attention' },
  { name: 'cat-executive', className: 'bg-cat-executive' },
  { name: 'cat-motor', className: 'bg-cat-motor' },
  { name: 'cat-language', className: 'bg-cat-language' },
  { name: 'cat-mobility', className: 'bg-cat-mobility' },
  { name: 'bar', className: 'bg-bar' },
  { name: 'bar-solid', className: 'bg-bar-solid' },
];

const categories: { title: string; tint: RowTint; value: string }[] = [
  { title: 'Memory', tint: 'cat-memory', value: '4 tests' },
  { title: 'Attention', tint: 'cat-attention', value: '3 tests' },
  { title: 'Executive function', tint: 'cat-executive', value: '2 tests' },
  { title: 'Motor', tint: 'cat-motor', value: '5 tests' },
  { title: 'Language', tint: 'cat-language', value: '2 tests' },
  { title: 'Mobility', tint: 'cat-mobility', value: '3 tests' },
];

function DotIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function TrayIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 28 12 10h24l6 18v10H6V28Z" />
      <path d="M6 28h11l2 5h10l2-5h11" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-title-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const [range, setRange] = useState<Range>('M');
  const [reminders, setReminders] = useState(true);
  const [kiosk, setKiosk] = useState(false);
  const [presses, setPresses] = useState(0);

  return (
    <main className="min-h-dvh bg-grouped text-label">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pt-12 pb-16">
        <h1 className="px-1 text-large-title">Design system</h1>

        <Section title="Buttons">
          <Card>
            <div className="flex flex-col gap-4">
              {(['primary', 'secondary', 'plain', 'destructive'] as const).map((variant) => (
                <div key={variant} className="flex flex-wrap items-center gap-3">
                  <Button variant={variant}>{variant}</Button>
                  <Button variant={variant} size="lg">
                    {variant} large
                  </Button>
                  <Button variant={variant} disabled>
                    disabled
                  </Button>
                </div>
              ))}
              <Button size="lg" fullWidth>
                Full width
              </Button>
            </div>
          </Card>
        </Section>

        <Section title="Cards">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-body">A plain card holds any content.</p>
            </Card>
            <Card title="Steps" action="Today">
              <p className="text-title-1 font-semibold">6,214</p>
            </Card>
            <Card
              title="Pressable"
              action={<ChevronRightIcon className="h-3.5 w-2 text-label-tertiary" />}
              onPress={() => setPresses((count) => count + 1)}
            >
              <p className="text-body">Pressed {presses} times</p>
            </Card>
          </div>
        </Section>

        <Section title="Grouped list">
          <GroupedList header="Browse" footer="Categories use their own colour; the accent stays for actions.">
            {categories.map((category) => (
              <GroupedListRow
                key={category.title}
                title={category.title}
                icon={<DotIcon />}
                iconTint={category.tint}
                value={category.value}
                chevron
                onPress={() => undefined}
              />
            ))}
          </GroupedList>
          <GroupedList header="Rows">
            <GroupedListRow title="Static row" value="Value" />
            <GroupedListRow title="With subtitle" subtitle="Secondary line of text" value="12" />
            <GroupedListRow title="Link to home" subtitle="Renders a router link" href="/" chevron />
          </GroupedList>
        </Section>

        <Section title="Badges">
          <Card>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="positive">Improving</Badge>
              <Badge tone="warning">Missed</Badge>
              <Badge tone="critical">Flagged</Badge>
            </div>
          </Card>
        </Section>

        <Section title="Empty state">
          <Card>
            <EmptyState
              icon={<TrayIcon />}
              title="No sessions yet"
              message="Sessions appear here once the patient completes one."
              action={<Button variant="secondary">Assign a session</Button>}
            />
          </Card>
        </Section>

        <Section title="Form fields">
          <Card>
            <div className="flex flex-col gap-5">
              <TextField label="Name" placeholder="Full name" hint="As it appears on the ID card." />
              <TextField label="Email" type="email" defaultValue="not-an-email" error="Enter a valid email address." />
              <TextArea label="Note" placeholder="Write a note" />
              <Select label="Attending" defaultValue="b">
                <option value="a">Dr. Ana Pop</option>
                <option value="b">Dr. Mihai Ionescu</option>
                <option value="c">Dr. Ioana Radu</option>
              </Select>
              <Toggle label="Daily reminders" checked={reminders} onChange={setReminders} />
              <Toggle label="Kiosk mode" hint="Locks the tablet to the session." checked={kiosk} onChange={setKiosk} />
            </div>
          </Card>
        </Section>

        <Section title="Segmented control">
          <Card>
            <SegmentedControl aria-label="Range" options={ranges} value={range} onChange={setRange} />
            <p className="mt-3 text-subhead text-label-secondary">Selected: {range}</p>
          </Card>
        </Section>

        <Section title="Colours">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {swatches.map((swatch) => (
              <div key={swatch.name} className="overflow-hidden rounded-card bg-surface shadow-card">
                <div className={`h-14 border-b border-separator ${swatch.className}`} />
                <p className="px-3 py-2 text-footnote font-medium">{swatch.name}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}
