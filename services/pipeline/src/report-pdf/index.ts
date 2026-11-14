import { PageSizes, PDFDocument, rgb, StandardFonts, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import type { MetricId, MetricPoint, Patient, ReportScore, Session, SessionReport, Side } from '@tempo/shared';
import {
  activityLabel,
  dateTimeLabel,
  flagLabel,
  locationLabel,
  metricLabel,
  modeLabel,
  sideLabel,
  signedWithUnit,
  skipReasonLabel,
  stageLabel,
  withUnit,
} from './labels.ts';
import { fitText, limitLines, safeText, wrapText } from './text.ts';
import { drawTrend } from './trend.ts';

export type ReportPdfHistory = { metricId: MetricId; side?: Side; previous: number | null; points: MetricPoint[] };

export type ReportPdfInput = {
  report: SessionReport;
  patient: Pick<Patient, 'name' | 'institutionPatientId' | 'dateOfBirth'>;
  session: Pick<Session, 'mode' | 'partial' | 'createdAt' | 'startedAt'>;
  history: ReportPdfHistory[];
};

export const historyMonths = 6;

const [pageWidth, pageHeight] = PageSizes.A4;
const margin = 48;
const footerHeight = 18;
const contentWidth = pageWidth - 2 * margin;
const bottomLimit = margin + footerHeight;

const ink = rgb(0.1, 0.1, 0.12);
const muted = rgb(0.4, 0.42, 0.46);
const rule = rgb(0.8, 0.81, 0.84);
const flagColor = rgb(0.72, 0.33, 0.0);

const maxSkips = 5;
const maxFlags = 3;
const maxScores = 10;
const maxSummaryLines = 7;
const blockHeight = 150;
const chartWidth = 290;

type Fonts = { regular: PDFFont; bold: PDFFont };
type TextStyle = { x?: number; size?: number; bold?: boolean; color?: Color; width?: number };

type Writer = {
  page: PDFPage;
  y: () => number;
  move: (by: number) => void;
  text: (value: string, style?: TextStyle) => void;
  line: (value: string, style?: TextStyle) => void;
  heading: (value: string) => void;
  rule: () => void;
};

const createWriter = (doc: PDFDocument, fonts: Fonts, safe: (value: string) => string): Writer => {
  const page = doc.addPage(PageSizes.A4);
  let y = pageHeight - margin;

  const move = (by: number): void => {
    if (y - by < bottomLimit) throw new Error('Report content does not fit on the page');
    y -= by;
  };

  const text = (value: string, { x = margin, size = 10, bold = false, color = ink, width }: TextStyle = {}): void => {
    const font = bold ? fonts.bold : fonts.regular;
    const room = width ?? margin + contentWidth - x;
    page.drawText(fitText(safe(value), font, size, room), { x, y: y - size, size, font, color });
  };

  const line = (value: string, style: TextStyle = {}): void => {
    const size = style.size ?? 10;
    if (y - size * 1.4 < bottomLimit) throw new Error('Report content does not fit on the page');
    text(value, style);
    move(size * 1.4);
  };

  return {
    page,
    y: () => y,
    move,
    text,
    line,
    heading: (value) => {
      move(8);
      line(value, { size: 12, bold: true });
      move(2);
    },
    rule: () => {
      move(4);
      page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 0.5, color: rule });
      move(6);
    },
  };
};

const more = (writer: Writer, hidden: number): void => {
  if (hidden > 0) writer.line(`and ${hidden} more`, { size: 9, color: muted, x: margin + 12 });
};

const seriesKey = (metricId: MetricId, side: Side | undefined): string => `${metricId}|${side ?? 'none'}`;

const scoreColumns = [
  { title: 'Activity', width: 98 },
  { title: 'Metric', width: 110 },
  { title: 'Side', width: 36 },
  { title: 'Value', width: 70 },
  { title: 'Baseline', width: 70 },
  { title: 'Own range', width: 100 },
  { title: '', width: 15 },
] as const;

const scorerLabels: Record<ReportScore['scoredBy'], string> = {
  code: 'Tempo, computed',
  ai: 'AI, open to clinician override',
  clinician: 'Clinician',
};

const bandLabel =(score: ReportScore): string =>
  score.referenceBand === null
    ? 'not set'
    : `${withUnit(score.referenceBand.low, score.unit)} to ${withUnit(score.referenceBand.high, score.unit)}`;

const scoreCells = (score: ReportScore): string[] => [
  activityLabel(score.activityId),
  metricLabel(score.metricId),
  sideLabel(score.side),
  withUnit(score.value, score.unit),
  score.baseline === null ? 'not set' : withUnit(score.baseline, score.unit),
  bandLabel(score),
  score.flagged ? '*' : '',
];

const drawRow = (writer: Writer, cells: string[], style: TextStyle): void => {
  let x = margin;
  scoreColumns.forEach((column, index) => {
    writer.text(cells[index] ?? '', { ...style, x, width: column.width - 6 });
    x += column.width;
  });
  writer.move((style.size ?? 9) * 1.45);
};

const drawSummary = (doc: PDFDocument, fonts: Fonts, safe: (value: string) => string, input: ReportPdfInput): void => {
  const { report, patient, session } = input;
  const w = createWriter(doc, fonts, safe);
  const status = report.skipped.length > 0 ? 'Completed with skips' : 'Completed';

  w.line('Tempo session report', { size: 20, bold: true });
  w.move(4);
  w.line(patient.name, { size: 13, bold: true });
  w.line(`Patient ID: ${patient.institutionPatientId}    Date of birth: ${patient.dateOfBirth}`);
  w.line(
    `Session: ${dateTimeLabel(session.startedAt ?? session.createdAt)}    Mode: ${modeLabel(session.mode)}    Status: ${status}${session.partial ? ' (partial)' : ''}`,
  );
  w.line(`Report generated: ${dateTimeLabel(report.generatedAt)}`, { size: 9, color: muted });
  w.line('Decision support, not a diagnosis.', { bold: true });
  w.rule();

  w.heading('Skipped activities');
  if (report.skipped.length === 0) w.line('None.', { color: muted });
  for (const skip of report.skipped.slice(0, maxSkips)) {
    w.line(`${activityLabel(skip.activityId)}: ${skipReasonLabel(skip.reason)}. Stopped at: ${stageLabel(skip.stage)}.`, {
      bold: true,
    });
    const extra = [
      ...(skip.painLocation === undefined ? [] : [`Location: ${locationLabel(skip.painLocation)}.`]),
      ...(skip.note === undefined ? [] : [`Note: ${skip.note}`]),
    ];
    if (extra.length > 0) w.line(extra.join(' '), { size: 9, x: margin + 12 });
  }
  more(w, report.skipped.length - maxSkips);

  w.heading('Attention flags');
  if (report.attention.length === 0) w.line('None.', { color: muted });
  for (const flag of report.attention.slice(0, maxFlags)) w.line(flagLabel(flag), { size: 9.5 });
  more(w, report.attention.length - maxFlags);

  w.heading('Scores');
  if (report.scores.length === 0) {
    w.line('No scored activities in this session.', { color: muted });
  } else {
    drawRow(w, scoreColumns.map((column) => column.title), { size: 8.5, bold: true, color: muted });
    for (const score of report.scores.slice(0, maxScores)) {
      drawRow(w, scoreCells(score), { size: 9, ...(score.flagged ? { color: flagColor } : {}) });
    }
    more(w, report.scores.length - maxScores);
    if (report.scores.some((score) => score.flagged)) {
      w.line('* Flagged change, for clinician review.', { size: 8, color: muted });
    }
  }

  w.heading('AI-generated summary');
  const summarySize = 9.5;
  const summary = limitLines(
    wrapText(safe(report.aiSummary.summary), fonts.regular, summarySize, contentWidth),
    maxSummaryLines,
    fonts.regular,
    summarySize,
    contentWidth,
  );
  for (const text of summary) w.line(text, { size: summarySize });
  w.line(
    `Model: ${report.aiSummary.ai.model}    Prompt version: ${report.aiSummary.ai.promptVersion}    AI output, check before relying on it.`,
    { size: 7.5, color: muted },
  );
};

export const monthsBefore = (iso: string, months: number): string => {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString();
};

const drawDetailHeader = (w: Writer, input: ReportPdfInput): void => {
  w.line('Tempo session report: details', { size: 14, bold: true });
  w.line(`${input.patient.name}    Patient ID: ${input.patient.institutionPatientId}    Session: ${dateTimeLabel(input.session.startedAt ?? input.session.createdAt)}`, {
    size: 9,
    color: muted,
  });
  w.rule();
};

const drawBlock = (
  w: Writer,
  fonts: Fonts,
  safe: (value: string) => string,
  input: ReportPdfInput,
  score: ReportScore,
  history: ReportPdfHistory | undefined,
): void => {
  const top = w.y();
  const points = history?.points ?? [];
  const previous = history?.previous ?? null;
  const to = points.at(-1)?.t ?? input.session.startedAt ?? input.session.createdAt;
  const format = (value: number) => safe(withUnit(value, score.unit));
  const side = score.side ? ` (${sideLabel(score.side).toLowerCase()})` : '';

  w.line(`${activityLabel(score.activityId)}: ${metricLabel(score.metricId)}${side}`, { size: 11, bold: true });
  const textWidth = contentWidth - chartWidth - 12;
  const facts = [
    `This session: ${withUnit(score.value, score.unit)}`,
    `Baseline: ${score.baseline === null ? 'not set yet' : withUnit(score.baseline, score.unit)}`,
    `Own range: ${bandLabel(score)}`,
    `Previous: ${previous === null ? 'none' : withUnit(previous, score.unit)}`,
    ...(previous === null ? [] : [`Change from previous: ${signedWithUnit(score.value - previous, score.unit)}`]),
    `Scored by: ${scorerLabels[score.scoredBy]}`,
  ];
  for (const fact of facts) w.line(fact, { size: 9.5, width: textWidth });
  if (score.flagged) w.line('Flagged change, for clinician review.', { size: 9.5, bold: true, color: flagColor, width: textWidth });

  drawTrend(
    w.page,
    fonts.regular,
    { x: margin + contentWidth - chartWidth, y: top - blockHeight + 14, width: chartWidth, height: blockHeight - 34 },
    {
      points,
      currentSessionId: input.report.sessionId,
      baseline: score.baseline,
      referenceBand: score.referenceBand,
      from: monthsBefore(to, historyMonths),
      to,
      format,
    },
  );
  w.move(top - w.y() > blockHeight ? 0 : blockHeight - (top - w.y()));
};

const drawDetails = (doc: PDFDocument, fonts: Fonts, safe: (value: string) => string, input: ReportPdfInput): void => {
  const histories = new Map(input.history.map((entry) => [seriesKey(entry.metricId, entry.side), entry]));
  let writer: Writer | undefined;
  for (const score of input.report.scores) {
    if (!writer || writer.y() - blockHeight < bottomLimit) {
      writer = createWriter(doc, fonts, safe);
      drawDetailHeader(writer, input);
    }
    drawBlock(writer, fonts, safe, input, score, histories.get(seriesKey(score.metricId, score.side)));
  }
};

const drawFooters = (doc: PDFDocument, font: PDFFont): void => {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const size = 7.5;
    const y = margin - 6;
    page.drawText('Tempo session report. Decision support, not a diagnosis.', { x: margin, y, size, font, color: muted });
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, { x: margin + contentWidth - font.widthOfTextAtSize(label, size), y, size, font, color: muted });
  });
};

export const renderSessionReportPdf = async (input: ReportPdfInput): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const generatedAt = new Date(input.report.generatedAt);
  doc.setTitle('Tempo session report');
  doc.setCreator('Tempo');
  doc.setProducer('Tempo');
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const charset = new Set(fonts.regular.getCharacterSet());
  const safe = (value: string): string => safeText(value, charset);

  drawSummary(doc, fonts, safe, input);
  drawDetails(doc, fonts, safe, input);
  drawFooters(doc, fonts.regular);
  return doc.save();
};
