import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { cx } from './cx.ts';

export interface QrCodeProps {
  value: string;
  label: string;
  size?: number;
  className?: string;
}

const quietZone = 4;

interface QrMatrix {
  moduleCount: number;
  path: string;
}

function qrMatrix(value: string): QrMatrix {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();
  const moduleCount = code.getModuleCount();
  const segments: string[] = [];
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (code.isDark(row, col)) segments.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  return { moduleCount, path: segments.join('') };
}

export function QrCode({ value, label, size = 224, className }: QrCodeProps) {
  const { moduleCount, path } = useMemo(() => qrMatrix(value), [value]);
  const extent = moduleCount + quietZone * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      className={cx('block h-auto max-w-full rounded-control bg-qr-tile', className)}
    >
      <path d={path} className="fill-qr-module" />
    </svg>
  );
}
