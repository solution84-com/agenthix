import { ModelAccessPanel } from '../../../model-access/pages/ModelAccessPanel'
import { useModelAccess } from '../../../model-access/pages/useModelAccess'
import { Heading } from '../../../auth/pages/parts/authUi'
import type { OnboardingData } from '../../queries'
import { AsideCard, AsideLabel, OnboardingFrame, StepButtons } from './OnboardingFrame'

const OWN = (id: string) => ({ ownerType: 'user' as const, ownerId: id })

/**
 * Onboarding's model step, shown only when neither the organisation nor the
 * person's projects give them model access: the same Add model access menu as
 * setup, offering only their own Claude subscription. An API key is the
 * organisation's to add.
 */
export function ModelStep({ data, onBack, onNext }: { data: OnboardingData; onBack: () => void; onNext: () => void }) {
  const mine = OWN(data.me.id)
  const { set } = useModelAccess(mine, mine)
  const aside = (
    <div>
      <AsideLabel>Why you are asked</AsideLabel>
      <AsideCard title="Model access for your own conversations">
        <ul className="space-y-1.5 text-body text-text-primary">
          <li className="flex justify-between gap-3"><span>{data.orgName}'s shared access</span><span className="text-small text-text-muted">none</span></li>
          <li className="flex justify-between gap-3"><span>Your own Claude subscription</span><span className="text-small text-text-muted">{set.some(s => s.id === 'subscription') ? 'added' : 'not added'}</span></li>
        </ul>
      </AsideCard>
      <p className="text-small text-text-muted">You can change this any time in Settings › Your model logins.</p>
    </div>
  )
  return (
    <OnboardingFrame identity={data.identity} step="model" needsModel aside={aside}>
      <Heading title="Talk to agents" lead={`${data.orgName} has no shared model access for your own conversations. Add your Claude subscription to talk to agents in your Chat.`} />
      <ModelAccessPanel keyOwner={mine} subscriptionOwner={mine} only={['subscription']} />
      <p className="mt-3 text-small text-text-muted">Only your own subscription is offered here. An API key is the organisation's to add.</p>
      <StepButtons onBack={onBack} nextLabel={set.length === 0 ? 'Skip for now' : 'Continue'} onNext={onNext} />
    </OnboardingFrame>
  )
}
