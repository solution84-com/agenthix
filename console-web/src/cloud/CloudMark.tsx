import { hostingLabel } from '@agenthix/ui/primitives'
import type { CloudAsk } from './api'
import { Notice } from '../components'

/** Cloud's own name on its sunrise, where a group or a section is Cloud's (boards *The look*). */
export function CloudMark({ count }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full bg-linear-90 from-sunrise-from via-sunrise-via to-sunrise-to px-2.5 py-0.5 text-micro font-semibold normal-case tracking-normal text-on-sunrise">
        {hostingLabel('cloud')}
      </span>
      {count !== undefined && <span className="text-small font-medium text-text-secondary">· {count}</span>}
    </span>
  )
}

/** What the server said of a Cloud action, in a sentence: a scaffold says plainly that the organisation is not connected. */
export function CloudAskNotice({ ask }: { ask: CloudAsk }) {
  if (ask.phase !== 'said') return null
  return <Notice tone="warning" title={ask.title}>{ask.message}</Notice>
}
