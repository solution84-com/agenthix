import { useState } from 'react'
import { useQuery, useAction, getAiProviderImpact, removeAiProvider, revokeAiProvider } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { AI_PROVIDER_VENDOR_INFO } from '@agenthix/core'
import { Button, Modal } from '@agenthix/ui/primitives'
import { impactLines } from './providerWords'

export type ImpactKind = 'remove' | 'revoke'

export interface ImpactDialogProps {
  kind: ImpactKind
  provider: AiProviderSummary
  onClose: () => void
}

/**
 * Remove or revoke, with what falls to what read from the operation before anything is confirmed. Neither is refused:
 * taking away the last provider of a type warns that it goes down until another is added (ADR-0160).
 */
export function ImpactDialog({ kind, provider, onClose }: ImpactDialogProps) {
  const { data: impact, error: loadError } = useQuery(getAiProviderImpact, { id: provider.id })
  const act = useAction(kind === 'remove' ? removeAiProvider : revokeAiProvider)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const vendor = AI_PROVIDER_VENDOR_INFO[provider.vendor].label
  const revoke = kind === 'revoke'

  const confirm = async () => {
    setWorking(true)
    setError('')
    try {
      await act({ id: provider.id })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={revoke ? `Revoke ${provider.name} now?` : `Remove ${provider.name}?`}>
      <div className="space-y-4">
        {revoke && <p className="text-body text-text-secondary">For a key that may have leaked. HQ drops it at once, and nothing can use it again.</p>}
        {!impact && !loadError && <p className="text-small text-text-muted">Checking what depends on it…</p>}
        {loadError && <p role="alert" className="text-small text-danger">{loadError.message}</p>}
        {impact && (
          <ul className="space-y-2 text-body text-text-secondary">
            {impactLines(impact).map(line => <li key={line}>{line}</li>)}
            {impactLines(impact).length === 0 && <li>Nothing uses it.</li>}
          </ul>
        )}
        {revoke && <p className="text-small text-text-muted">Revoke the key at {vendor} too: HQ cannot.</p>}
        {impact && <p className="text-small text-text-muted">Every organisation admin is told what moved, and it is recorded.</p>}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="danger" disabled={!impact || working} onClick={() => void confirm()}>{working ? 'Working…' : revoke ? 'Revoke now' : 'Remove'}</Button>
        </div>
      </div>
    </Modal>
  )
}
