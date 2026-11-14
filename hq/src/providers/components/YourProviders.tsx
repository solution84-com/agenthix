import { useState } from 'react'
import { useQuery, getAiProviders } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { AI_ANCHORS } from '../../admin/aiPage'
import { useScrollToHash } from '../../admin/useScrollToHash'
import { ImpactDialog } from './ImpactDialog'
import { ReplaceKeyDialog, RenameDialog } from './KeyAndNameDialogs'
import { ProviderLine, type LineAction } from './ProviderLine'
import { AiSectionHeading } from '../../capabilities/components/AiSectionHeading'

type Open = { action: LineAction; id: string } | null

/**
 * Your providers, the AI page's first section: every provider with its state, kinds, runtime and Settings' tools.
 * `current` is the provider a link opened.
 */
export function YourProviders({ current }: { current: string | null }) {
  const query = useQuery(getAiProviders)
  const { data: providers } = query
  const read = useBackgroundRead(query, { what: 'The providers' })
  const [open, setOpen] = useState<Open>(null)
  useScrollToHash(providers !== undefined)
  const chosen = open ? providers?.find(p => p.id === open.id) : undefined
  const onAction = (action: LineAction, p: AiProviderSummary) => setOpen({ action, id: p.id })
  const close = () => setOpen(null)

  return (
    <section id={AI_ANCHORS.providers} aria-labelledby="ai-providers" className="scroll-mt-4">
      <AiSectionHeading id="ai-providers" meta={providers ? read.nudge : null}>Your providers</AiSectionHeading>
      {!providers && read.failedWithoutData && read.nudge}
      {!providers && !read.failedWithoutData && <p className="text-small text-text-muted">Loading…</p>}
      {providers && providers.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-body text-text-secondary">No providers yet. Add one so agents can think, hear and speak.</p>
      )}
      {providers && providers.length > 0 && (
        <ul className="space-y-3" aria-label="Providers">
          {providers.map(p => <ProviderLine key={p.id} provider={p} current={p.id === current} onAction={onAction} />)}
        </ul>
      )}
      {chosen && open?.action === 'replace' && <ReplaceKeyDialog open provider={chosen} onClose={close} />}
      {chosen && open?.action === 'rename' && <RenameDialog open provider={chosen} onClose={close} />}
      {chosen && (open?.action === 'remove' || open?.action === 'revoke') && <ImpactDialog kind={open.action} provider={chosen} onClose={close} />}
    </section>
  )
}
