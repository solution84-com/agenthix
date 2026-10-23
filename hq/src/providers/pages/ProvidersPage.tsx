import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, getAiProviders } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { Button, Modal } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { CloudConnectPanel } from '../components/CloudConnectPanel'
import { AddProviderDialog } from '../components/AddProviderDialog'
import { ImpactDialog } from '../components/ImpactDialog'
import { ReplaceKeyDialog, RenameDialog } from '../components/KeyAndNameDialogs'
import { ProviderLine, type LineAction } from '../components/ProviderLine'

type Open = { action: LineAction; id: string } | null

/** Where the organisation's models and voice come from. Organisation admins only; the server refuses anyone else. */
export function ProvidersPage() {
  const { data: providers, error } = useQuery(getAiProviders)
  const [params] = useSearchParams()
  const linked = params.get('provider')
  const [adding, setAdding] = useState(false)
  const [cloudOpen, setCloudOpen] = useState(false)
  const cloudConnected = providers?.some(p => p.vendor === 'cloud' && p.state !== 'disconnected') ?? false
  const [open, setOpen] = useState<Open>(null)
  const chosen = open ? providers?.find(p => p.id === open.id) : undefined

  useEffect(() => {
    if (linked && providers?.some(p => p.id === linked)) document.getElementById(`provider-${linked}`)?.scrollIntoView?.({ block: 'center' })
  }, [linked, providers])

  const onAction = (action: LineAction, p: AiProviderSummary) => setOpen({ action, id: p.id })
  const close = () => setOpen(null)

  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: 'Providers' }]}>
      <div className="max-w-[860px] px-4 py-9 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold text-text-primary">Providers</h1>
            <p className="mt-0.5 text-small text-text-secondary">Where the organisation&rsquo;s models and voice come from, and who bills for them. Which models people get is chosen under Models.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCloudOpen(true)}>{cloudConnected ? 'Agenthix Cloud…' : 'Connect Agenthix Cloud'}</Button>
            <Button onClick={() => setAdding(true)}>Add provider</Button>
          </div>
        </div>

        {error && <p role="alert" className="mt-6 text-small text-danger">{error.message}</p>}
        {!providers && !error && <p className="mt-6 text-small text-text-muted">Loading…</p>}
        {providers && providers.length === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-body text-text-secondary">No providers yet. Add one to give HQ models and voice.</p>
        )}
        {providers && providers.length > 0 && (
          <ul className="mt-6 space-y-3" aria-label="Providers">
            {providers.map(p => <ProviderLine key={p.id} provider={p} highlighted={p.id === linked} onAction={onAction} />)}
          </ul>
        )}
      </div>

      <AddProviderDialog open={adding} onClose={() => setAdding(false)} onAdded={() => undefined} existingVendors={providers?.map(p => p.vendor) ?? []} onChooseCloud={() => { setAdding(false); setCloudOpen(true) }} />
      <Modal open={cloudOpen} onClose={() => setCloudOpen(false)} title="Agenthix Cloud">
        <CloudConnectPanel allowDisconnect />
      </Modal>
      {chosen && open?.action === 'replace' && <ReplaceKeyDialog open provider={chosen} onClose={close} />}
      {chosen && open?.action === 'rename' && <RenameDialog open provider={chosen} onClose={close} />}
      {chosen && (open?.action === 'remove' || open?.action === 'revoke') && <ImpactDialog kind={open.action} provider={chosen} onClose={close} />}
    </AppLayout>
  )
}
