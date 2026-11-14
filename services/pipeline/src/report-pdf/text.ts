import type { PDFFont } from 'pdf-lib';

const ellipsis = '…';

const encodable = (text: string, charset: ReadonlySet<number>): boolean =>
  Array.from(text).every((char) => charset.has(char.codePointAt(0) ?? -1));

export const safeText = (value: string, charset: ReadonlySet<number>): string =>
  Array.from(value.normalize('NFC').replace(/\s+/g, ' '))
    .map((char) => {
      if (encodable(char, charset)) return char;
      const base = char.normalize('NFD').replace(/\p{M}/gu, '');
      return base !== '' && encodable(base, charset) ? base : '?';
    })
    .join('');

export const fitText = (text: string, font: PDFFont, size: number, maxWidth: number): string => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && font.widthOfTextAtSize(`${chars.join('').trimEnd()}${ellipsis}`, size) > maxWidth) {
    chars.pop();
  }
  return `${chars.join('').trimEnd()}${ellipsis}`;
};

export const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ').filter((part) => part !== '')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current !== '') lines.push(current);
      current = fitText(word, font, size, maxWidth);
    }
  }
  if (current !== '') lines.push(current);
  return lines;
};

export const limitLines = (lines: string[], max: number, font: PDFFont, size: number, maxWidth: number): string[] => {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  const last = kept.at(-1) ?? '';
  kept[kept.length - 1] = fitText(`${last}${ellipsis}`, font, size, maxWidth);
  return kept;
};
