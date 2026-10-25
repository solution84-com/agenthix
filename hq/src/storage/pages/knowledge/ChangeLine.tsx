import { Link } from 'react-router'
import { changedLabel } from '@agenthix/ui/projects'
import type { ChangeAuthorView, LastChange } from './knowledgeTypes'
import { authorHref } from './history/authorLabel'

/** "Mia", or "Kernel, asked by Sam". */
export function authorWords(by: ChangeAuthorView): string {
  return by.kind === 'person' ? by.name : `${by.agentName}, asked by ${by.forName}`
}

/** "5 days ago · Kernel, asked by Sam"; the author links to where the change was made when it can. */
export function ChangeLine({ change, fallbackAt, linked }: { change?: LastChange; fallbackAt?: string; linked?: boolean }) {
  const when = changedLabel(change?.at ?? fallbackAt)
  if (!change) return <>{when}</>
  const href = linked ? authorHref(change.by) : null
  const who = authorWords(change.by)
  return (
    <>
      {when} · {href ? <Link to={href} className="text-accent underline underline-offset-2">{who}</Link> : who}
    </>
  )
}
