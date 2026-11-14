import { describe, expect, it } from 'vitest';
import type { MedicalRecord, Medication, SessionPlan } from '@tempo/shared';
import { planForDevice } from './device-plan.ts';

const now = new Date('2026-11-14T09:00:00.000Z');

const medication = (id: string, name: string, stopDate?: string): Medication => ({
  id,
  name,
  dose: '75 mg',
  frequency: 'once daily',
  startDate: '2026-08-01',
  ...(stopDate === undefined ? {} : { stopDate }),
});

const record = (medications: Medication[]): MedicalRecord => ({
  patientId: 'pat-2',
  yearsOfEducation: 10,
  dominantHand: 'right',
  affectedLimbs: [],
  diagnoses: [],
  medications,
  limitations: [],
  clinicalNotes: '',
  rehabGoals: [],
  timeline: [],
  updatedAt: '2026-10-01T08:00:00.000Z',
  updatedBy: 'staff-att-1',
});

const plan: SessionPlan = {
  id: 'plan-2',
  version: 1,
  patientId: 'pat-2',
  items: [
    { activityId: 'check-in-pain', kind: 'check-in', config: {} },
    { activityId: 'check-in-medication', kind: 'check-in', config: {} },
  ],
  schedule: { sessions: 2, per: 'week' },
  language: 'en',
  createdBy: 'staff-ther-1',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

describe('planForDevice', () => {
  it('fills the medication check-in with the medications current today', () => {
    const meds = [
      medication('med-1', 'Clopidogrel'),
      medication('med-2', 'Levodopa/Carbidopa', '2026-10-01'),
      medication('med-3', 'Atorvastatin', '2026-11-14'),
      medication('med-4', 'Baclofen', '2026-12-01'),
    ];
    const filled = planForDevice(plan, record(meds), now);
    expect(filled.items[0]).toEqual(plan.items[0]);
    expect(filled.items[1]?.config).toEqual({
      medications: [
        { medicationId: 'med-1', name: 'Clopidogrel' },
        { medicationId: 'med-4', name: 'Baclofen' },
      ],
    });
    expect(plan.items[1]?.config).toEqual({});
  });

  it('keeps a list the plan sets itself', () => {
    const own: SessionPlan = {
      ...plan,
      items: [{ activityId: 'check-in-medication', kind: 'check-in', config: { medications: [] } }],
    };
    expect(planForDevice(own, record([medication('med-1', 'Clopidogrel')]), now)).toEqual(own);
  });

  it('leaves the plan alone without a record or current medications', () => {
    expect(planForDevice(plan, undefined, now)).toBe(plan);
    expect(planForDevice(plan, record([medication('med-2', 'Levodopa/Carbidopa', '2026-10-01')]), now)).toBe(plan);
  });
});
