import { useState } from 'react'
import { useQuery, useAction, getAiProviderRecords, checkAiProviderNow } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'
import { Button, CARD_CHOSEN } from '@agenthix/ui/primitives'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { keyWords, sinceWords, usedByWords } from './providerWords'
import { ProviderCardCore } from './ProviderCardCore'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

export type LineAction = 'replace' | 'rename' | 'remove' | 'revoke'

function History({ id }: { id: string }) {
  const query = useQuery(getAiProviderRecords, { id })
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The records' })
  if (!data) return read.failedWithoutData ? <>{read.nudge}</> : <p className="text-small text-text-muted">Loading…</p>
  if (data.length === 0) return <>{read.nudge}<p className="text-small text-text-muted">No changes recorded.</p></>
  return (
    <>
    {read.nudge}
    <ul className="space-y-0.5 text-small text-text-secondary">
      {data.map(r => (
        <li key={r.id}>
          {sinceWords(r.at)} · {r.action.replace(/_/g, ' ')}{r.detail ? `: ${r.detail}` : ''} · {r.by?.name ?? (r.actor === 'machine' ? 'the machine admin' : 'HQ')}
        </li>
      ))}
    </ul>
    </>
  )
}

export interface ProviderLineProps {
  provider: AiProviderSummary
  /** The line a notification linked to. */
  current?: boolean
  onAction: (action: LineAction, provider: AiProviderSummary) => void
}

const since = (iso: string) => {
  const words = sinceWords(iso)
  return words === 'just now' ? 'Just now.' : `Since ${words}.`
}

/**
 * One provider on the AI page: the card core setup draws too (its kinds, state in words with the vendor's message, and
 * runtime), with since when, who bills, its key's end, its address, what depends on it, its history and Settings' tools.
 */
export function ProviderLine({ provider: p, current, onAction }: ProviderLineProps) {
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

  const actions = (
    <>
      <Button size="sm" variant="secondary" disabled={checking} onClick={() => void checkNow()}>{checking ? 'Checking…' : 'Check now'}</Button>
      {!isCloud && <Button size="sm" variant="ghost" aria-expanded={history} onClick={() => setHistory(h => !h)}>History</Button>}
      <OverflowMenu items={items} label={`More about ${p.name}`} />
    </>
  )

  return (
    <ProviderCardCore provider={p} current={current} stateNote={since(p.stateSince)} actions={actions}
      className={`rounded-2xl border bg-card p-4 ${current ? CARD_CHOSEN : 'border-border-subtle'}`}>
      <p className="mt-1 text-small text-text-secondary">
        {isCloud ? 'Billed by Agenthix' : info.label}
        {key && ` · ${key}`}
      </p>
      {p.baseUrl && <p className="mt-0.5 break-all text-small text-text-secondary">Address: <span className="font-mono">{p.baseUrl}</span></p>}
      {used && <p className="mt-1 text-small text-text-secondary">{used}</p>}
      <ShowAttention kind="alert" text={checkError} title="The check did not finish" onClose={() => setCheckError('')} />
      {history && <div className="mt-3 border-t border-border-subtle pt-3"><History id={p.id} /></div>}
    </ProviderCardCore>
  )
}
