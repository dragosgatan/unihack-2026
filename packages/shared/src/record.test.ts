import { describe, expect, it } from 'vitest';
import { medicalRecordSchema, timelineEventSchema } from './record.ts';
import { attending, levodopaChange, medicalRecord } from './test-fixtures.ts';

describe('timelineEventSchema', () => {
  it('accepts a medication change', () => {
    expect(timelineEventSchema.safeParse(levodopaChange).success).toBe(true);
  });
});

describe('medicalRecordSchema', () => {
  it('accepts a neurological record', () => {
    expect(medicalRecordSchema.safeParse(medicalRecord).success).toBe(true);
  });

  it('accepts a sports record with an injury block', () => {
    const record = {
      patientId: 'pat-3',
      yearsOfEducation: 16,
      dominantHand: 'left',
      affectedLimbs: [{ limb: 'leg', side: 'right', prosthesis: false }],
      injury: {
        structure: 'Anterior cruciate ligament',
        side: 'right',
        dateOfInjury: '2026-07-04',
        surgery: { date: '2026-07-20', type: 'ACL reconstruction, hamstring graft' },
        sport: { name: 'Football', level: 'competitive' },
        rehabPhase: {
          name: 'Phase 2',
          enteredAt: '2026-09-01',
          targets: [
            { label: 'Full extension', met: true },
            { label: 'Symmetry above 90%', met: false },
          ],
        },
        phaseHistory: [
          {
            name: 'Phase 1',
            enteredAt: '2026-07-21',
            completedAt: '2026-09-01',
            targets: [{ label: 'No swelling after exercise', met: true }],
            decidedBy: attending.id,
          },
        ],
      },
      diagnoses: [{ code: 'S83.511A', label: 'Sprain of anterior cruciate ligament of right knee' }],
      medications: [],
      limitations: [],
      clinicalNotes: '',
      rehabGoals: ['Return to training'],
      timeline: [],
      updatedAt: '2026-10-01T08:05:00.000Z',
      updatedBy: attending.id,
    };
    expect(medicalRecordSchema.safeParse(record).success).toBe(true);
  });

  it('rejects a malformed ICD-10 code', () => {
    const record = { ...medicalRecord, diagnoses: [{ code: 'parkinson', label: "Parkinson's disease" }] };
    expect(medicalRecordSchema.safeParse(record).success).toBe(false);
  });
});
