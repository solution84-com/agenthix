import { useState } from 'react'
import { useQuery, useAction, getAiProviderRecords, checkAiProviderNow } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { STATE_TONE, STATE_WORDS, TYPE_WORDS, keyWords, sinceWords, usedByWords } from './providerWords'

export type LineAction = 'replace' | 'rename' | 'remove' | 'revoke'

function History({ id }: { id: string }) {
  const { data, error } = useQuery(getAiProviderRecords, { id })
  if (error) return <p className="text-small text-danger">{error.message}</p>
  if (!data) return <p className="text-small text-text-muted">Loading…</p>
  if (data.length === 0) return <p className="text-small text-text-muted">No changes recorded.</p>
  return (
    <ul className="space-y-0.5 text-small text-text-secondary">
      {data.map(r => (
        <li key={r.id}>
          {sinceWords(r.at)} · {r.action.replace(/_/g, ' ')}{r.detail ? `: ${r.detail}` : ''} · {r.by?.name ?? (r.actor === 'machine' ? 'the machine admin' : 'HQ')}
        </li>
      ))}
    </ul>
  )
}

export interface ProviderLineProps {
  provider: AiProviderSummary
  /** The line a notification linked to. */
  highlighted?: boolean
  onAction: (action: LineAction, provider: AiProviderSummary) => void
}

/** One provider: what it is, its state in words and since when, the vendor's message, what depends on it, its key's end. */
export function ProviderLine({ provider: p, highlighted, onAction }: ProviderLineProps) {
  const check = useAction(checkAiProviderNow)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [history, setHistory] = useState(false)
  const info = AI_PROVIDER_VENDOR_INFO[p.vendor]
  const isCloud = p.vendor === 'cloud'
  const used = usedByWords(p.usedBy)
  const key = keyWords(p)

  const checkNow = async () => {
    setChecking(true)
    setCheckError('')
    try { await check({ id: p.id }) } catch (err) { setCheckError(err instanceof Error ? err.message : 'Could not check') } finally { setChecking(false) }
  }

  const items: OverflowItem[] = isCloud ? [] : [
    { label: 'Replace key', onSelect: () => onAction('replace', p) },
    { label: 'Rename', onSelect: () => onAction('rename', p) },
    { label: 'Remove', onSelect: () => onAction('remove', p), danger: true },
    { label: 'Revoke now', onSelect: () => onAction('revoke', p), danger: true },
  ]

  return (
    <li id={`provider-${p.id}`} aria-current={highlighted ? 'true' : undefined} className={`rounded-2xl border bg-card p-4 ${highlighted ? 'border-accent bg-accent-subtle' : 'border-border-subtle'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold text-text-primary">{p.name}</h3>
            <StatePill tone={STATE_TONE[p.state]}>{STATE_WORDS[p.state]}</StatePill>
            <span className="text-small text-text-muted">since {sinceWords(p.stateSince)}</span>
          </div>
          <p className="mt-0.5 text-small text-text-secondary">
            {p.types.map(t => TYPE_WORDS[t]).join(', ')} · {isCloud ? 'billed by Agenthix' : info.label}
            {key && ` · ${key}`}
          </p>
          {p.baseUrl && <p className="mt-0.5 break-all text-small text-text-secondary">Address: <span className="font-mono">{p.baseUrl}</span></p>}
          {p.stateDetail && <p className="mt-1 text-small text-danger">{info.label} says: {p.stateDetail}</p>}
          {used && <p className="mt-1 text-small text-text-secondary">{used}</p>}
          {checkError && <p role="alert" className="mt-1 text-small text-danger">{checkError}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={checking} onClick={() => void checkNow()}>{checking ? 'Checking…' : 'Check now'}</Button>
          {!isCloud && <Button size="sm" variant="ghost" aria-expanded={history} onClick={() => setHistory(h => !h)}>History</Button>}
          <OverflowMenu items={items} label={`More about ${p.name}`} />
        </div>
      </div>
      {history && <div className="mt-3 border-t border-border-subtle pt-3"><History id={p.id} /></div>}
    </li>
  )
}
