import { useAuth } from 'wasp/client/auth'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { SignInPreview } from './SignInPreview'
import { HqSiteWarning } from './HqSiteLine'
import { Heading, PRIMARY, SECONDARY, Steps } from '../../../auth/pages/parts/authUi'
import { ModelAccessPanel } from '../../../model-access/pages/ModelAccessPanel'
import { useModelAccess } from '../../../model-access/pages/useModelAccess'
import type { HqSiteState } from '../../hqSiteState'

type Props = {
  orgName: string
  /** The organisation's stored picture and cover paths, for the sign-in page drawn beside the form. */
  avatarUrl: string | null
  coverUrl: string | null
  hqSite: HqSiteState
  onNext: () => void
  onCheckAgain: () => void
  onBack: () => void
}

/**
 * Setup's third step: how agents reach a model, optional. One menu adds a
 * Claude subscription (saved as the admin's own login, adr-0105) or an
 * organisation key; Continue reads "Skip for now" until something is set.
 */
export function ModelStep({ orgName, avatarUrl, coverUrl, hqSite, onNext, onCheckAgain, onBack }: Props) {
  const { data: me } = useAuth()
  const meId = (me as { id?: string } | null | undefined)?.id ?? ''
  const { set } = useModelAccess({ ownerType: 'org', ownerId: 'org' }, { ownerType: 'user', ownerId: meId })
  return (
    <AuthLayout setup side={<SignInPreview name={orgName} pictureSrc={avatarUrl} coverSrc={coverUrl} />}>
      <Steps step={3} />
      <Heading title="Model access" lead="Agents need a model to answer. Add at least one — you can change this any time." />
      <ModelAccessPanel keyOwner={{ ownerType: 'org', ownerId: 'org' }} subscriptionOwner={{ ownerType: 'user', ownerId: meId }} />
      <HqSiteWarning connected={hqSite.state === 'connected'} onCheckAgain={onCheckAgain} />
      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" onClick={onNext} className={`${PRIMARY} flex-1`}>{set.length === 0 ? 'Skip for now' : 'Continue'}</button>
      </div>
    </AuthLayout>
  )
}
