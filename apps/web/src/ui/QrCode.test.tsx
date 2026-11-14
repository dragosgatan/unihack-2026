import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import qrcode from 'qrcode-generator';
import { QrCode } from './QrCode.tsx';

afterEach(cleanup);

const sampleUrl = 'https://tempo.example/patient/home?code=123456';

function moduleCountFor(value: string): number {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();
  return code.getModuleCount();
}

describe('QrCode', () => {
  it('draws the dark modules as one path with a four-module quiet zone', () => {
    render(<QrCode value={sampleUrl} label="Pairing link" />);
    const image = screen.getByRole('img', { name: 'Pairing link' });
    const paths = image.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    const extent = moduleCountFor(sampleUrl) + 8;
    expect(image.getAttribute('viewBox')).toBe(`0 0 ${extent} ${extent}`);
  });
});
