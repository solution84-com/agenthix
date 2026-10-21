import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, getOnboardingData } from 'wasp/client/operations'
import { rememberWelcome } from '../../auth/pages/parts/welcomeLine'
import { nextStep, previousStep, stepFromParam, type Step } from '../onboardingFlow'
import { JoinReviewStep } from './steps/JoinReviewStep'
import { ModelStep } from './steps/ModelStep'
import { ReviewStep } from './steps/ReviewStep'
import { YouStep } from './steps/YouStep'

/**
 * Onboarding, for every invited person (getting-in spec, Onboarding): Join (the
 * account is made on the invitation link; here it is reviewed), You, Model access
 * only when needed, then a last look and Start working. The step is in the
 * address (?step=), so a refresh keeps it and Back and Forward move between steps.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery(getOnboardingData)
  const [params, setParams] = useSearchParams()
  const [starting, setStarting] = useState(false)

  // The first admin's account is setup's, never onboarding's.
  useEffect(() => { if (data?.needsSetup) navigate('/setup', { replace: true }) }, [data, navigate])

  if (isLoading || !data || data.needsSetup) return <div className="min-h-screen bg-surface-1" />

  const step = stepFromParam(params.get('step'), data.needsModel)
  // Editing from the last look (&then=review) returns there instead of going on in order.
  const backToReview = params.get('then') === 'review' && step !== 'review'
  const go = (to: Step, then?: 'review') => setParams(then ? { step: to, then } : { step: to })
  const advance = async () => {
    await refetch()
    go(backToReview ? 'review' : nextStep(step, data.needsModel))
  }
  const back = () => go(backToReview ? 'review' : previousStep(step, data.needsModel) ?? 'join')

  const start = () => {
    setStarting(true)
    if (data.landAt !== '/') rememberWelcome(data.me.displayName ?? data.me.username ?? '')
    navigate(data.landAt)
  }

  if (step === 'join') return <JoinReviewStep data={data} onNext={() => void advance()} />
  if (step === 'you') return <YouStep data={data} onBack={back} onNext={() => void advance()} />
  if (step === 'model') return <ModelStep data={data} onBack={back} onNext={() => void advance()} />
  return <ReviewStep data={data} onEdit={to => go(to, 'review')} onBack={() => go(previousStep('review', data.needsModel) ?? 'you')} onStart={start} starting={starting} />
}
