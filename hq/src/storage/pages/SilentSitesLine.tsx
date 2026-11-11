import type { SiteSilence } from '@agenthix/core'
import { ShowAttention } from '@agenthix/ui/attention'
import { silentSitesLine } from './workspaceNotices'

/** Said once in the dialog when sites could not be asked for their workspaces, with the names behind it. */
export function SilentSitesLine({ unanswered }: { unanswered: SiteSilence[]; className?: string }) {
  const silent = silentSitesLine(unanswered)
  if (!silent) return null
  return <ShowAttention kind="alert" title="Not every site answered" text={<><p>{silent.line}</p><p className="mt-2 text-text-secondary">{silent.names.join(', ')}</p></>} />
}
