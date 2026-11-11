import { Link } from 'react-router'
import { FOCUS_RING, FOCUS_RING_INSET } from '@agenthix/ui/primitives'
import type { OverviewRow, OverviewWork } from './overviewWork'

const TONE = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' } as const
const ACTION_WORDS = { review: 'Review', assign: 'Assign an agent', runAgain: 'Run again' } as const

function Heading({ children, count }: { children: string; count?: number }) {
  return (
    <h3 className="mt-5 flex items-center gap-2 text-small font-medium text-text-secondary first:mt-0">
      {children}{count !== undefined && <span className="text-text-muted">{count}</span>}
    </h3>
  )
}

function Row({ row, base }: { row: OverviewRow; base: string }) {
  return (
    <Link to={`${base}?task=${row.key}`} className={`mt-1 flex items-start gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`}>
      <span className="w-16 shrink-0 text-small text-text-muted">{row.key}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-text-primary">{row.title}</span>
        <span className={`block truncate text-small ${TONE[row.tone]}`}>
          {row.state}{row.result && <span className="text-text-secondary"> · “{row.result}”</span>}
        </span>
      </span>
      {row.action && <span className="shrink-0 text-small font-medium text-text-primary">{ACTION_WORDS[row.action]}</span>}
    </Link>
  )
}

/** A member's work on the overview (P4): four short lists and a way to all of it. */
export function ProjectWork({ work, projectKey }: { work: OverviewWork; projectKey: string }) {
  const base = `/projects/${projectKey}`
  return (
    <div data-testid="project-work">
      {work.needsYou.length > 0 && (
        <>
          <Heading count={work.needsYou.length}>Needs you</Heading>
          {work.needsYou.map(r => <Row key={r.key} row={r} base={base} />)}
        </>
      )}
      {work.running.length > 0 && (
        <>
          <Heading count={work.running.length}>Running</Heading>
          {work.running.map(r => <Row key={r.key} row={r} base={base} />)}
        </>
      )}
      {work.upNext.length > 0 && (
        <>
          <Heading count={work.upNextTotal}>Up next</Heading>
          {work.upNext.map(r => <Row key={r.key} row={r} base={base} />)}
        </>
      )}
      {work.finished.length > 0 && (
        <>
          <Heading>Recently finished</Heading>
          {work.finished.map(r => <Row key={r.key} row={r} base={base} />)}
        </>
      )}
      <Link to={`${base}?tool=tasks`} className={`rounded mt-4 inline-block text-small text-link hover:underline ${FOCUS_RING}`}>
        All {work.total} {work.total === 1 ? 'task' : 'tasks'} →
      </Link>
    </div>
  )
}
