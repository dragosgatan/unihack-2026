import { useState } from 'react';
import { Button } from './Button.tsx';
import { Card } from './Card.tsx';
import { GroupedList, GroupedListRow } from './GroupedList.tsx';
import { Select } from './Select.tsx';
import { TextArea } from './TextArea.tsx';
import { TextField } from './TextField.tsx';
import { Sheet } from './Sheet.tsx';

const sessions = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  title: `Session ${index + 1}`,
  value: `Day ${index * 2 + 1}`,
}));

export function SheetShowcase() {
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [saved, setSaved] = useState(0);

  function save() {
    setSaved((count) => count + 1);
    setFormOpen(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 text-title-3 font-semibold">Sheet</h2>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setFormOpen(true)}>Add note</Button>
          <Button variant="secondary" onClick={() => setListOpen(true)}>
            All sessions
          </Button>
        </div>
        <p className="mt-3 text-subhead text-label-secondary">Notes saved: {saved}</p>
      </Card>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New note"
        action={
          <Button variant="plain" onClick={save}>
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <TextField label="Title" placeholder="Short summary" />
          <TextArea label="Note" placeholder="Write a note" />
          <Select label="Visibility" defaultValue="team">
            <option value="team">Care team</option>
            <option value="me">Only me</option>
          </Select>
        </div>
      </Sheet>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="All sessions">
        <GroupedList>
          {sessions.map((session) => (
            <GroupedListRow key={session.id} title={session.title} value={session.value} />
          ))}
        </GroupedList>
      </Sheet>
    </section>
  );
}
