/** A page's address with *Plan maintenance* open on it, the thing — and what to do, when known — already chosen. */
export function maintenanceAddress(page: string, which: string | null, what: string | null = null): string {
  const q = new URLSearchParams({ panel: 'maintenance' })
  if (which) q.set('which', which)
  if (what) q.set('what', what)
  return `${page}?${q.toString()}`
}
