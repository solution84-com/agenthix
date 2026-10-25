import { Link } from 'react-router'
import { authorHref, authorLabel } from './authorLabel'
import type { ChangeAuthorView } from './types'

/** Who made a change, as on the page: a person, or "Kernel, asked by Sam" with a link to where it happened. */
export function AuthorLine({ by }: { by: ChangeAuthorView | undefined }) {
  const href = authorHref(by)
  return (
    <span>
      {authorLabel(by)}
      {href && (
        <>
          <span aria-hidden> · </span>
          <Link to={href} className="text-accent hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">
            {by?.kind === 'agent' && by.conversationId ? 'the conversation' : 'the run'}
          </Link>
        </>
      )}
    </span>
  )
}
