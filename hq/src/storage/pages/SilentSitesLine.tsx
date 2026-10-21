import { useState } from 'react'
import type { SiteSilence } from '@agenthix/core'
import { silentSitesLine } from './workspaceNotices'

/** The one quiet line when sites could not be asked for their workspaces, with the names behind it. */
export function SilentSitesLine({ unanswered, className = 'px-4 py-2' }: { unanswered: SiteSilence[]; className?: string }) {
  const [showSites, setShowSites] = useState(false)
  const silent = silentSitesLine(unanswered)
  if (!silent) return null
  return (
    <p role="status" className={`${className} text-small text-text-muted`}>
      {silent.line}{' '}
      <button type="button" className="text-accent hover:underline" aria-expanded={showSites} onClick={() => setShowSites(s => !s)}>Which</button>
      {showSites && <span className="mt-1 block text-text-secondary">{silent.names.join(', ')}</span>}
    </p>
  )
}
