export const controlClasses =
  'w-full rounded-control border bg-surface px-3 text-body text-label placeholder:text-label-tertiary focus:outline-2 focus:-outline-offset-1 focus:outline-accent disabled:opacity-40';

export function controlBorder(error: string | undefined): string {
  return error ? 'border-critical' : 'border-separator';
}
