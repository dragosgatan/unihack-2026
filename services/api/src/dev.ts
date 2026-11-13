import { serve } from '@hono/node-server';
import { createMockApp } from './mock/app.ts';
import { buildSeed, demoSessionCodes } from './mock/seed/build.ts';
import { mockStaffTokens } from './mock/seed/institution.ts';

const port = 8787;
const seed = buildSeed(new Date());

serve({ fetch: createMockApp({ seed }).fetch, port }, () => {
  console.log(`Mock API listening on http://localhost:${port}`);
  console.log('Staff tokens (Authorization: Bearer <token>; no header acts as the attending):');
  for (const [token, staffId] of mockStaffTokens) {
    const staff = seed.staff.find((member) => member.id === staffId);
    console.log(`  ${token.padEnd(16)} ${staff?.name ?? staffId} (${staff?.role ?? 'unknown'})`);
  }
  console.log('Demo session codes (always valid, each redeem starts a new kiosk session):');
  for (const [code, patientId] of demoSessionCodes) {
    const patient = seed.patients.find((candidate) => candidate.id === patientId);
    console.log(`  ${code}  ${patient?.name ?? patientId}`);
  }
});
