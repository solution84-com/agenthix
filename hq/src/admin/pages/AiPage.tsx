import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, getAiProviders } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { useFeature } from '../../features/useFeature'
import { AddProviderDialog } from '../../providers/components/AddProviderDialog'
import { CloudConnectPanel } from '../../providers/components/CloudConnectPanel'
import { YourProviders } from '../../providers/components/YourProviders'
import { CapabilitiesSection } from '../../capabilities/components/CapabilitiesSection'
import { WhichModelsMayRun } from '../../models-settings/components/WhichModelsMayRun'
import { ADMIN_CRUMB } from '../adminCrumbs'
import { AI_ANCHORS, providerLineUrl } from '../aiPage'

/** The provider a link opened (`#provider-<id>`), or null. */
const linkedProvider = (hash: string): string | null => {
  const m = /^#provider-(.+)$/.exec(hash)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Manage organisation › AI: what agents can do first (the answer, which a long list of providers never pushes out of
 * view), then the providers, one line each, then which models may run.
 * Organisation admins only; the server refuses anyone else. A link opens a section or a provider's line by its anchor.
 */
export function AiPage() {
  const { hash, key: linkKey } = useLocation()
  const navigate = useNavigate()
  const { data: providers } = useQuery(getAiProviders)
  const [adding, setAdding] = useState(false)
  const cloudOn = useFeature('cloud')
  const [cloudOpen, setCloudOpen] = useState(false)
  const cloudConnected = providers?.some(p => p.vendor === 'cloud' && p.state !== 'disconnected') ?? false
  const linked = linkedProvider(hash)

  return (
    <AppLayout breadcrumbs={[ADMIN_CRUMB, { label: 'AI' }]}>
      <div className="max-w-[860px] space-y-8 px-4 py-9 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-medium text-text-primary">AI</h1>
            <p className="mt-0.5 text-small text-text-secondary">
              The accounts agents think, hear, speak and search with, and what every agent uses unless it has its own.
            </p>
          </div>
          <div className="flex gap-2">
            {cloudOn && <Button variant="secondary" onClick={() => setCloudOpen(true)}>{cloudConnected ? 'Agenthix Cloud…' : 'Connect Agenthix Cloud'}</Button>}
            <Button onClick={() => setAdding(true)}>Add a provider</Button>
          </div>
        </div>

        <CapabilitiesSection onAddProvider={() => setAdding(true)} onOpenProvider={id => navigate(providerLineUrl(id))} />
        <YourProviders current={linked} linkKey={linkKey} />
        <WhichModelsMayRun opened={hash === `#${AI_ANCHORS.models}`} />
      </div>

      <AddProviderDialog open={adding} onClose={() => setAdding(false)} onAdded={() => undefined} existingVendors={providers?.map(p => p.vendor) ?? []} />
      <Modal open={cloudOn && cloudOpen} onClose={() => setCloudOpen(false)} title="Agenthix Cloud">
        <CloudConnectPanel allowDisconnect />
      </Modal>
    </AppLayout>
  )
}
