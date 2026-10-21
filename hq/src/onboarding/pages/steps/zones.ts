/** Every zone the browser knows, with `extra` added if the browser's list lacks it. */
export function zoneOptions(extra: string | null): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const all = known.includes('UTC') ? known : ['UTC', ...known]
  return extra && !all.includes(extra) ? [extra, ...all] : all
}

export const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone
