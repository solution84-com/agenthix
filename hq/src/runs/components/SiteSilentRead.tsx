import { Nudge } from '@agenthix/ui/attention'
import type { UnansweredSitesCopy } from '../../shared/siteSilence'

/** A read that failed because its site did not answer, with nothing on screen yet: said at once, in place of the content. */
export function SiteSilentRead({ copy, retry }: { copy: UnansweredSitesCopy; retry: () => void }) {
  return (
    <Nudge place="content" title={copy.headline} action={{ label: 'Try again', onClick: retry }}>
      {copy.sites.map(s => `${s.heading} · ${s.detail}`).join(' ')}
    </Nudge>
  )
}
