import type { AssistantActionId, Language, MetricId } from '@tempo/shared';
import type { AiFunctionCall, AiPart, AiTool } from './provider.ts';

const fingerTappingMetric: MetricId = 'finger-tapping.taps-per-second';
const spokenClip = 'go back';

type Replies = Record<Language, string>;

type Rule = {
  pattern: RegExp;
  reply: Replies;
  call?: { id: AssistantActionId; params: (match: RegExpMatchArray) => unknown };
};

const refusal = (pattern: RegExp, reply: Replies): Rule => ({ pattern, reply });

const rules: Rule[] = [
  refusal(/^(do the test for me|fă testul pentru mine)/i, {
    en: 'That one is yours to do. I can repeat the instructions.',
    ro: 'Pe acesta îl faceți dumneavoastră. Pot repeta instrucțiunile.',
  }),
  refusal(/^(accept the suggestion|acceptă sugestia)/i, {
    en: 'You have to accept a suggestion by hand.',
    ro: 'O sugestie se acceptă doar manual.',
  }),
  refusal(/^(how did i do|cum m-am descurcat)/i, {
    en: 'Your therapist is the one to ask about that.',
    ro: 'Despre asta întrebați-vă terapeutul.',
  }),
  {
    pattern: /^(go back|înapoi)/i,
    reply: { en: 'Going back.', ro: 'Mă întorc.' },
    call: { id: 'goBack', params: () => ({}) },
  },
  {
    pattern: /^(repeat|repetă)/i,
    reply: { en: 'Here are the instructions again.', ro: 'Iată din nou instrucțiunile.' },
    call: { id: 'repeatInstructions', params: () => ({}) },
  },
  {
    pattern: /^(pause|pauză)/i,
    reply: { en: 'Pausing.', ro: 'Pun pauză.' },
    call: { id: 'pauseSession', params: () => ({}) },
  },
  {
    pattern: /^(i can't do this|i cannot do this|nu pot)\b/i,
    reply: { en: 'Opening the "I can\'t do this" screen.', ro: 'Deschid ecranul „Nu pot face asta”.' },
    call: { id: 'cannotDo', params: () => ({}) },
  },
  {
    pattern: /^(?:open|deschide) (.+)$/i,
    reply: { en: 'Opening that patient.', ro: 'Deschid pacientul.' },
    call: { id: 'openPatient', params: (match) => ({ spokenName: match[1] }) },
  },
  {
    pattern: /^show finger tapping/i,
    reply: { en: 'Showing finger tapping.', ro: 'Afișez atingerea degetelor.' },
    call: { id: 'openMetric', params: () => ({ metricId: fingerTappingMetric }) },
  },
  {
    pattern: /^(how was|cum a fost) .+/i,
    reply: { en: 'Asking the record.', ro: 'Întreb dosarul.' },
    call: { id: 'askRecord', params: (match) => ({ question: match[0] }) },
  },
  {
    pattern: /^my pain is (\d{1,2})\b/i,
    reply: { en: 'Pain noted. Shall I save that?', ro: 'Am notat durerea. O salvez?' },
    call: { id: 'answerCheckIn', params: (match) => ({ item: 'pain', intensity: Number(match[1]) }) },
  },
];

const cannotHere: Replies = { en: "I can't do that here.", ro: 'Nu pot face asta aici.' };

const textOf = (part: AiPart | undefined): string | undefined => (part && 'text' in part ? part.text : undefined);

export const mockAssistantCalls = (parts: AiPart[], tools: AiTool[]): AiFunctionCall[] => {
  const language: Language = textOf(parts[0])?.includes('Romanian') ? 'ro' : 'en';
  const last = parts.at(-1);
  const said = textOf(last) ?? spokenClip;
  const transcript = last && 'text' in last ? undefined : spokenClip;
  const declared = new Set(tools.map((tool) => tool.name));
  const request = said.trim();

  const matched = rules
    .map((rule) => ({ rule, match: request.match(rule.pattern) }))
    .find((candidate) => candidate.match !== null);
  const call = matched?.rule.call;
  const runs = matched?.match && call && declared.has(call.id) ? { call, match: matched.match } : undefined;
  const reply = matched && (!call || runs) ? matched.rule.reply : cannotHere;

  return [
    ...(runs ? [{ name: runs.call.id, arguments: runs.call.params(runs.match) }] : []),
    { name: 'respond', arguments: { reply: reply[language], ...(transcript === undefined ? {} : { transcript }) } },
  ];
};
