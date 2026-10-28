import { useState } from 'react'
import { useQuery, getHqCloudConnection } from 'wasp/client/operations'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Heading, PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import { CLOUD_NOT_AVAILABLE_WORDS, CloudConnectPanel } from '../../../providers/components/CloudConnectPanel'

type Props = {
  position: { step: number; total: number }
  /** The organisation's sign-in page, as the step before it made it. */
  side: React.ReactNode
  onOwnKeys: () => void
  onCloudConnected: () => void
  onLater: () => void
  onBack: () => void
}

function Card({ title, badge, disabled, quiet, children }: { title: string; badge?: string; disabled?: boolean; quiet?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={title} aria-disabled={disabled} className={`mb-3 rounded-xl border px-4 py-3 ${quiet ? 'border-dashed border-border-strong' : 'border-border'} ${disabled ? 'opacity-70' : ''}`}>
      <h2 className="text-body font-semibold text-text-primary">{title}{badge && <span className="ml-2 text-small font-normal text-text-muted">{badge}</span>}</h2>
      {children}
    </section>
  )
}

/**
 * Setup's third step: how agents reach AI. Agenthix Cloud covers models and voice; own keys add two more steps; Later
 * goes straight to the last look, and agents can't think or talk until a provider is added (ADR-0160).
 */
export function ChoiceStep({ position, side, onOwnKeys, onCloudConnected, onLater, onBack }: Props) {
  const { data: cloud } = useQuery(getHqCloudConnection)
  const [connecting, setConnecting] = useState(false)
  const available = cloud?.aiAvailable ?? false
  const connected = !!cloud?.connection
  return (
    <AuthLayout setup side={side}>
      <Steps step={position.step} total={position.total} name="AI" />
      <Heading title="How will your agents reach AI?" lead="Agents need a model to think, and a voice to hear and to talk. Choose one, or set it up later." />
      <Card title="Agenthix Cloud" badge={available ? 'Recommended' : 'Not available yet'} disabled={!available}>
        {available ? (
          <>
            <p className="mt-1 text-small text-text-secondary">Models and voice, no keys. Billed by Agenthix each month. You approve it with a short code, and you&rsquo;re done.</p>
            <div className="mt-3">
              {connecting || connected
                ? <CloudConnectPanel onConnected={onCloudConnected} />
                : <button type="button" onClick={() => setConnecting(true)} className={SECONDARY}>Connect</button>}
              {connected && <button type="button" onClick={onCloudConnected} className={`${PRIMARY} mt-3`}>Continue</button>}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-small text-text-secondary">{CLOUD_NOT_AVAILABLE_WORDS}</p>
            <button type="button" disabled className={`${SECONDARY} mt-3`}>Connect</button>
          </>
        )}
      </Card>
      <Card title="Your own keys">
        <p className="mt-1 text-small text-text-secondary">You bring an account at a model provider and one at a speech provider. Two more screens.</p>
        <button type="button" onClick={onOwnKeys} className={`${SECONDARY} mt-3`}>Choose</button>
      </Card>
      <Card title="Later" quiet>
        <p className="mt-1 text-small text-text-secondary">Go to the last look now. Agents can&rsquo;t think or talk until you add a provider, under Manage › Providers.</p>
        <button type="button" onClick={onLater} className={`${SECONDARY} mt-3`}>Set up later</button>
      </Card>
      <ActionRow><button type="button" onClick={onBack} className={SECONDARY}>Back</button></ActionRow>
    </AuthLayout>
  )
}
