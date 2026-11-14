import { useState, type ReactNode } from 'react'
import { providerStateWorks, type AiProviderSummary } from '@agenthix/core'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Heading, PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import { AddProviderDialog } from '../../../providers/components/AddProviderDialog'
import { WhatAgentsCanDoSetup } from './WhatAgentsCanDoSetup'
import { ProviderCards } from './ProviderCards'

type Props = {
  position: { step: number; total: number }
  /** The organisation's sign-in page, as the organisation step made it. */
  side: ReactNode
  providers: AiProviderSummary[]
  /** A provider was added or removed: read the list again. */
  onProvidersChanged: () => void
  onNext: () => void
  onBack: () => void
}

/**
 * Setup's third step: what the organisation's agents think, hear and speak with. One layout whether nothing, one or
 * several providers are added: the list, one Add a provider button opening the pop-up, and what agents can do. Skipping is
 * never blocked (ADR-0160): Skip for now while nothing works, Continue once a provider does.
 */
export function AiStep({ position, side, providers, onProvidersChanged, onNext, onBack }: Props) {
  const [adding, setAdding] = useState(false)
  const ready = providers.some(p => providerStateWorks(p.state))
  return (
    <AuthLayout setup side={side}>
      <Steps step={position.step} total={position.total} name="AI" />
      <Heading title="Connect AI" lead="Agents think with a model, hear and speak with a voice, and search the web. Add the accounts you have." />
      <ProviderCards providers={providers} onChanged={onProvidersChanged} />
      <button type="button" onClick={() => setAdding(true)} className={`${SECONDARY} mb-5 w-full`}>＋ Add a provider</button>
      <WhatAgentsCanDoSetup providers={providers} />
      <ActionRow>
        <button type="button" onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" onClick={onNext} className={`${ready ? PRIMARY : SECONDARY} flex-1`}>{ready ? 'Continue' : 'Skip for now'}</button>
      </ActionRow>
      <AddProviderDialog open={adding} onClose={() => setAdding(false)} onAdded={onProvidersChanged} adminNotice={false} existingVendors={providers.map(p => p.vendor)} />
    </AuthLayout>
  )
}
