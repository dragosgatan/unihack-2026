import { runningActivityActionIds, type ActivityId, type AssistantActionId } from '@tempo/shared';

export const pendingAssistantActionIds = ['switchLanguage', 'readDueToday', 'markMedicationTaken'] as const;

export type PatientAssistantActionId = AssistantActionId | (typeof pendingAssistantActionIds)[number];

const running = runningActivityActionIds;
const checkIn = ['repeatInstructions', 'answerCheckIn', 'pauseSession'] as const;

export const patientScreenActions = {
  'patient.session.code': [],
  'patient.session.welcome': ['repeatInstructions', 'switchLanguage'],
  'patient.session.between': ['repeatInstructions', 'pauseSession'],
  'patient.session.paused': ['repeatInstructions'],
  'patient.session.cannot-do': ['repeatInstructions'],
  'patient.session.skipped': ['repeatInstructions', 'pauseSession'],
  'patient.session.finished': ['repeatInstructions'],
  'patient.check-in.pain': checkIn,
  'patient.check-in.medication': ['repeatInstructions', 'markMedicationTaken', 'pauseSession'],
  'patient.check-in.episodes': checkIn,
  'patient.activity.finger-tapping': running,
  'patient.activity.trail-making-a': running,
  'patient.activity.trail-making-b': running,
  'patient.activity.clock-drawing': running,
  'patient.activity.spiral-tracing': running,
  'patient.activity.word-recall': [],
  'patient.activity.shoulder-raise': running,
  'patient.activity.sit-to-stand': running,
  'patient.activity.single-leg-squat': running,
  'patient.home.install-first': [],
  'patient.home.pair': [],
  'patient.home.choose-pin': [],
  'patient.home.unlock': [],
  'patient.home.forgot-pin': [],
  'patient.home.install': ['repeatInstructions'],
  'patient.home': ['readDueToday', 'switchLanguage', 'navigate', 'logEpisode'],
  'patient.home.episode': ['repeatInstructions', 'logEpisode', 'goBack'],
} as const satisfies Record<string, readonly PatientAssistantActionId[]>;

export type PatientScreenId = keyof typeof patientScreenActions;

export const activityScreenId = (activityId: ActivityId) =>
  (activityId.startsWith('check-in-') ? `patient.check-in.${activityId.slice('check-in-'.length)}` : `patient.activity.${activityId}`) as PatientScreenId;
