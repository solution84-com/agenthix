import type { ReactNode } from 'react'
import { providerTypesCovered, type AiProviderSummary, type AiProviderType } from '@agenthix/core'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { FreshHqSide } from '../../../auth/pages/parts/BrandSide'
import { Heading, PRIMARY, SECONDARY, StateLine, Steps } from '../../../auth/pages/parts/authUi'
import { AddProviderForm } from '../../../providers/components/AddProviderDialog'

type Props = {
  position: { step: number; total: number }
  providers: AiProviderSummary[]
  onNext: () => void
  onBack: () => void
}

/** The provider of this type that works, if one is added: setup shows it instead of the form. */
function worksFor(providers: AiProviderSummary[], type: AiProviderType): AiProviderSummary | undefined {
  return providers.find(p => providerTypesCovered([p])[type])
}

function Part({ title, type, providers, onBack }: { title?: string; type: AiProviderType; providers: AiProviderSummary[]; onBack: () => void }): ReactNode {
  const have = worksFor(providers, type)
  return (
    <div className="mb-4">
      {title && <h2 className="mb-1.5 text-small font-medium text-text-muted">{title}</h2>}
      {have
        ? <StateLine tone="ok"><b className="font-semibold text-text-primary">{have.name}</b> works. Added by you.</StateLine>
        : <AddProviderForm type={type} existingVendors={providers.map(p => p.vendor)} onAdded={() => undefined} onCancel={onBack} />}
    </div>
  )
}

function Buttons({ ready, onNext, onBack }: { ready: boolean; onNext: () => void; onBack: () => void }) {
  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={onBack} className={SECONDARY}>Back</button>
      <button type="button" disabled={!ready} onClick={onNext} className={`${PRIMARY} flex-1`}>Continue</button>
    </div>
  )
}

/** Setup's third step (own keys): one model provider and its key, checked with the vendor before it is stored. */
export function ModelStep({ position, providers, onNext, onBack }: Props) {
  const ready = !!worksFor(providers, 'llm')
  return (
    <AuthLayout setup side={<FreshHqSide />}>
      <Steps step={position.step} total={position.total} name="Your model provider" />
      <Heading title="Your model provider" lead="Pick one. Agents think with it." />
      <Part type="llm" providers={providers} onBack={onBack} />
      <p className="text-small text-text-muted">You can add more providers, or Agenthix Cloud, later in Manage › Providers.</p>
      {ready && <Buttons ready onNext={onNext} onBack={onBack} />}
    </AuthLayout>
  )
}

/** Setup's fourth step (own keys): one speech-to-text and one text-to-speech provider, each with its key. */
export function VoiceStep({ position, providers, onNext, onBack }: Props) {
  const covered = providerTypesCovered(providers)
  return (
    <AuthLayout setup side={<FreshHqSide />}>
      <Steps step={position.step} total={position.total} name="Voice" />
      <Heading title="Voice" lead="People talk to agents, and agents talk back. One provider for each." />
      <Part title="Speech to text" type="stt" providers={providers} onBack={onBack} />
      <Part title="Text to speech" type="tts" providers={providers} onBack={onBack} />
      <p className="text-small text-text-muted">Each key is checked with its vendor before it is stored.</p>
      {covered.stt && covered.tts && <Buttons ready onNext={onNext} onBack={onBack} />}
    </AuthLayout>
  )
}
