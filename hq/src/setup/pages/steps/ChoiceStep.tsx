import { useState } from 'react'
import { useQuery, getHqCloudConnection } from 'wasp/client/operations'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { FreshHqSide } from '../../../auth/pages/parts/BrandSide'
import { Heading, PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import { CLOUD_NOT_AVAILABLE_WORDS, CloudConnectPanel } from '../../../providers/components/CloudConnectPanel'

type Props = {
  position: { step: number; total: number }
  onOwnKeys: () => void
  onCloudConnected: () => void
  onBack: () => void
}

function Card({ title, badge, disabled, children }: { title: string; badge?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={title} aria-disabled={disabled} className={`mb-3 rounded-xl border border-border px-4 py-3 ${disabled ? 'opacity-70' : ''}`}>
      <h2 className="text-body font-semibold text-text-primary">{title}{badge && <span className="ml-2 text-small font-normal text-text-muted">{badge}</span>}</h2>
      {children}
    </section>
  )
}

/** Setup's second step: how agents reach AI. Agenthix Cloud covers models and voice; own keys add two more steps. */
export function ChoiceStep({ position, onOwnKeys, onCloudConnected, onBack }: Props) {
  const { data: cloud } = useQuery(getHqCloudConnection)
  const [connecting, setConnecting] = useState(false)
  const available = cloud?.aiAvailable ?? false
  const connected = !!cloud?.connection
  return (
    <AuthLayout setup side={<FreshHqSide />}>
      <Steps step={position.step} total={position.total} name="AI" />
      <Heading title="How will your agents reach AI?" lead="Agents need a model to think, and a voice to hear and to talk. Choose one." />
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
        <p className="mt-1 text-small text-text-secondary">You bring an account at a model provider and one at a speech provider. Two more screens.{!available && ' This is the way through for now.'}</p>
        <button type="button" onClick={onOwnKeys} className={`${SECONDARY} mt-3`}>Choose</button>
      </Card>
      <div className="mt-5"><button type="button" onClick={onBack} className={SECONDARY}>Back</button></div>
    </AuthLayout>
  )
}
