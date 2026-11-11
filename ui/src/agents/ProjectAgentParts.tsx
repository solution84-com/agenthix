import type { ReactNode } from 'react'
import type { AgentFactsData } from './projectAgentTypes'
import type { NowTone } from './agentNowLines'
import { FOCUS_RING } from '../primitives/controlStyles'

/** How a presenter draws an agent's picture: hq resolves the stored path to one that loads. */
export type RenderAgentAvatar = (agent: Pick<AgentFactsData, 'id' | 'name' | 'avatarUrl'>, size: 'sm' | 'md' | 'lg') => ReactNode

const TONE: Record<NowTone, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }

export function NowLabel({ tone, children }: { tone: NowTone; children: ReactNode }) {
  return <span className={`font-medium ${TONE[tone]}`}>{children}</span>
}

export function LinkButton({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`rounded text-small text-link hover:underline ${FOCUS_RING}`}>
      {children}
    </button>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 px-4 pt-4">
      <h4 className="flex items-center justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
        <span>{title}</span>
        {action && <span className="normal-case tracking-normal">{action}</span>}
      </h4>
      {children}
    </section>
  )
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-muted">{label}</dt>
          <dd className="min-w-0 text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
