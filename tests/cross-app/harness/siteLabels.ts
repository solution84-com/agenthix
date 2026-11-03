// Kept apart from siteLeftovers.ts, which reads the run's environment on import, so its unit test needs none.

/**
 * The ids, from `docker … --format '{{.ID}}\t{{.Labels}}'` lines, of what carries a site label (any namespace's
 * `<namespace>.site`) naming one of `siteIds`.
 */
export function labelledWith(lines: string, siteIds: readonly string[]): string[] {
  const wanted = new Set(siteIds)
  const found: string[] = []
  for (const line of lines.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const id = line.slice(0, tab).trim()
    const labels = line.slice(tab + 1).split(',')
    if (labels.some(l => { const eq = l.indexOf('='); return eq > 0 && l.slice(0, eq).endsWith('.site') && wanted.has(l.slice(eq + 1)) })) found.push(id)
  }
  return found
}
