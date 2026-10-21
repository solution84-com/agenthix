import type { SiteSilence } from '@agenthix/core'

/** The one quiet line when sites could not be asked for their workspaces, and the names behind it. */
export function silentSitesLine(unanswered: SiteSilence[]): { line: string; names: string[] } | null {
  if (unanswered.length === 0) return null
  const one = unanswered.length === 1
  return {
    line: one
      ? "1 site isn't answering, so its workspaces aren't shown."
      : `${unanswered.length} sites aren't answering, so their workspaces aren't shown.`,
    names: unanswered.map(s => s.label),
  }
}

/** How a workspace's tool cap reads in its facts: no cap is "All". */
export function allowedToolsText(allowedTools: string[] | null): string {
  return allowedTools === null ? 'All' : `${allowedTools.length} ${allowedTools.length === 1 ? 'tool' : 'tools'}`
}
