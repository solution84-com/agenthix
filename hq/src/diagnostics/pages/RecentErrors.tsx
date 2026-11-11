import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { RecentErrorGroup } from '../recentErrors'
import { plural, sinceText } from './diagnosticsWords'

function When({ group }: { group: RecentErrorGroup }) {
  if (group.ongoing) return <>since {sinceText(group.firstAt)}</>
  return <>{plural(group.count, 'time')} · {group.count > 1 ? 'last ' : ''}{sinceText(group.lastAt)}</>
}

const LINK = `rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`

function where(group: RecentErrorGroup): string {
  const parts: string[] = []
  if (group.agent) parts.push(group.agent.name)
  if (group.project && !group.chatRun) parts.push(group.project.name)
  if (group.site) parts.push(`on ${group.site.label}`)
  return parts.join(' · ')
}

function ErrorRow({ group }: { group: RecentErrorGroup }) {
  const place = where(group)
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-body font-medium text-text-primary">
          {group.title} <span className="font-normal text-text-muted">· <When group={group} /></span>
        </p>
        {group.runLink && <Link to={group.runLink} className={LINK}>Open the run</Link>}
        {!group.runLink && group.siteLink && <Link to={group.siteLink} className={LINK}>Open the site</Link>}
      </div>
      <p className="text-small text-text-secondary">
        {place && <>{place} · </>}{group.advice}
      </p>
      {group.chatRun && (
        <p className="text-micro text-text-muted">The conversation is its owner's; it is not shown here.</p>
      )}
    </li>
  )
}

export function RecentErrorsList({ groups, range }: { groups: RecentErrorGroup[]; range: '24h' | '7d' }) {
  if (groups.length === 0) {
    return <p className="text-body text-text-muted">No errors in the last {range === '24h' ? '24 hours' : '7 days'}.</p>
  }
  return <ul className="divide-y divide-border-subtle border-y border-border-subtle">{groups.map(g => <ErrorRow key={g.key} group={g} />)}</ul>
}

