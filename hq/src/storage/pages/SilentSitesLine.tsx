import type { SiteSilence } from '@agenthix/core'
import { Nudge } from '@agenthix/ui/attention'
import { silentSitesLine } from './workspaceNotices'

/** A quiet line in the list's meta line when sites could not be asked for their workspaces, with the names behind it. */
export function SilentSitesLine({ unanswered, className = 'px-4 pt-2' }: { unanswered: SiteSilence[]; className?: string }) {
  const silent = silentSitesLine(unanswered)
  if (!silent) return null
  return <div className={className}><Nudge place="meta">{silent.line} {silent.names.join(', ')}.</Nudge></div>
}
