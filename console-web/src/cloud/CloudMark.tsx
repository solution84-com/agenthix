import { ReadFailure, isFinal } from '@agenthix/ui/attention'
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
  return <Notice kind="alert" title={ask.title}>{ask.message}</Notice>
}

/** A Cloud read that failed after its retries, in place of what it would show; a final answer is said without Try again. */
export function CloudReadFailure({ what, error, message, retry }: { what: string; error: unknown; message: string; retry: () => void }) {
  return isFinal(error) ? <ReadFailure what={what} final={message} /> : <ReadFailure what={what} retry={retry} because={message} />
}
