import type { ReactNode } from 'react'
import { providerTypesCovered, type AiProviderSummary, type AiProviderType } from '@agenthix/core'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Heading, PRIMARY, SECONDARY, StateLine, Steps } from '../../../auth/pages/parts/authUi'
import { AddProviderForm } from '../../../providers/components/AddProviderDialog'

type Props = {
  position: { step: number; total: number }
  /** The organisation's sign-in page, as the organisation step made it. */
  side: ReactNode
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

/** Always there, so nothing jumps: Skip for now until the step's providers work, then Continue only (ADR-0160). */
function Buttons({ ready, onNext, onBack }: { ready: boolean; onNext: () => void; onBack: () => void }) {
  return (
    <ActionRow>
      <button type="button" onClick={onBack} className={SECONDARY}>Back</button>
      {!ready && <button type="button" onClick={onNext} className={SECONDARY}>Skip for now</button>}
      <button type="button" disabled={!ready} onClick={onNext} className={`${PRIMARY} flex-1`}>Continue</button>
    </ActionRow>
  )
}

/** Setup's fourth step (own keys): one model provider and its key, checked with the vendor before it is stored, or skipped. */
export function ModelStep({ position, side, providers, onNext, onBack }: Props) {
  const ready = !!worksFor(providers, 'llm')
  return (
    <AuthLayout setup side={side}>
      <Steps step={position.step} total={position.total} name="Your model provider" />
      <Heading title="Your model provider" lead="Pick one. Agents think with it." />
      <Part type="llm" providers={providers} onBack={onBack} />
      <p className="text-small text-text-muted">You can add more providers, or Agenthix Cloud, later in Manage › Providers.</p>
      <Buttons ready={ready} onNext={onNext} onBack={onBack} />
    </AuthLayout>
  )
}

/** Whether a provider covers hearing and speaking by itself. */
const coversBoth = (p: AiProviderSummary) => {
  const c = providerTypesCovered([p])
  return c.stt && c.tts
}

const givesVoice = (p: AiProviderSummary) => {
  const c = providerTypesCovered([p])
  return c.stt || c.tts
}

/** Setup's fifth step (own keys): voice on one key where one provider covers hearing and speaking, or skipped. */
export function VoiceStep({ position, side, providers, onNext, onBack }: Props) {
  const covered = providerTypesCovered(providers)
  const both = providers.some(coversBoth)
  const none = !covered.stt && !covered.tts
  return (
    <AuthLayout setup side={side}>
      <Steps step={position.step} total={position.total} name="Voice" />
      <Heading title="Voice" lead="People talk to agents, and agents talk back. One Inworld key covers hearing and speaking." />
      {both ? (
        <div className="mb-4 space-y-1.5">
          {providers.filter(givesVoice).map(p => (
            <StateLine key={p.id} tone="ok">
              <b className="font-semibold text-text-primary">{p.name}</b> works.{p.vendor === 'cloud' ? '' : ' Added by you.'}{p.vendor === 'inworld' ? ' One key covers hearing and speaking.' : ''}
            </StateLine>
          ))}
        </div>
      ) : none ? (
        <Part type="stt" providers={providers} onBack={onBack} />
      ) : (
        <>
          <Part title="Speech to text" type="stt" providers={providers} onBack={onBack} />
          <Part title="Text to speech" type="tts" providers={providers} onBack={onBack} />
        </>
      )}
      <p className="text-small text-text-muted">Each key is checked with its vendor before it is stored.</p>
      <Buttons ready={covered.stt && covered.tts} onNext={onNext} onBack={onBack} />
    </AuthLayout>
  )
}
