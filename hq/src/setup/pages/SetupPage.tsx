import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, getSetupData, getSetupResume, getAiProviders, completeSetup } from 'wasp/client/operations'
import { YouStep } from './steps/YouStep'
import { AiStep } from './steps/AiStep'
import { OrgStep } from './steps/OrgStep'
import { ReviewStep } from './steps/ReviewStep'
import { SignInPreview } from './steps/SignInPreview'
import { neighbour, position, stepFromParam, stepOfResume, stepParam, type Step } from './setupSteps'

/**
 * Setup, once per HQ, for the first admin: You, Your organisation, AI (providers for models, hearing and speaking, or
 * skipped), then a last look. It opens at the step `getSetupResume` names, and finishing lands on Home, where the
 * built-in agent waits.
 */
export function SetupPage() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery(getSetupData)
  const { data: resume } = useQuery(getSetupResume)
  const { data: providers, refetch: refetchProviders } = useQuery(getAiProviders)
  const [params, setParams] = useSearchParams()
  const step: Step | null = stepFromParam(params.get('step')) ?? (resume ? stepOfResume(resume.step) : null)
  // Editing from the last look (&then=review) returns there instead of going on in order.
  const backToReview = params.get('then') === 'review' && step !== 'review'
  const go = (next: Step, also: Record<string, string> = {}) => setParams({ step: stepParam(next), ...also })
  const advance = async (from: Step) => {
    if (!backToReview) { go(neighbour(from, 1)); return }
    await refetch()
    go('review')
  }
  const back = (from: Step) => go(backToReview ? 'review' : neighbour(from, -1))
  const edit = (target: Step) => go(target, { then: 'review' })
  const [saved, setSaved] = useState<{ name: string; avatarUrl: string | null; coverUrl: string | null; timeZone: string } | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState('')

  // Setup is done, or is not this person's: nothing here for them.
  useEffect(() => { if (data && !data.needsSetup) navigate('/', { replace: true }) }, [data, navigate])

  if (isLoading || !data || !data.needsSetup || !step || !providers) return <div className="min-h-screen bg-surface-1" />

  const finish = async () => {
    setFinishing(true)
    setFinishError('')
    try {
      await completeSetup()
      navigate('/')
    } catch {
      setFinishError('Could not finish setup. Please try again.')
      setFinishing(false)
    }
  }

  const orgName = saved?.name ?? data.org?.name ?? ''
  const avatarUrl = saved ? saved.avatarUrl : data.org?.avatarUrl ?? null
  const coverUrl = saved ? saved.coverUrl : data.org?.coverUrl ?? null
  const timeZone = saved?.timeZone ?? data.org?.timeZone ?? 'UTC'
  const here = position(step)
  // From the organisation on, the panel beside each step is the sign-in page the organisation made.
  const orgSide = <SignInPreview name={orgName} pictureSrc={avatarUrl} coverSrc={coverUrl} />

  if (step === 'you') return <YouStep me={data.me} position={here} onNext={() => void advance('you')} />
  if (step === 'ai') {
    return <AiStep position={here} side={orgSide} providers={providers} onProvidersChanged={() => void refetchProviders()} onNext={() => void advance('ai')} onBack={() => back('ai')} />
  }
  if (step === 'org') {
    return <OrgStep position={here} initialName={orgName} initialTimeZone={timeZone} avatarUrl={avatarUrl} coverUrl={coverUrl} onBack={() => back('org')} onNext={now => { setSaved(now); void advance('org') }} />
  }
  return <ReviewStep position={here} providers={providers} timeZone={timeZone} me={data.me} orgName={data.org?.name ?? ''} avatarUrl={data.org?.avatarUrl ?? null} coverUrl={data.org?.coverUrl ?? null} hqSite={data.hqSite} onCheckAgain={() => void refetch()} onEdit={edit} onBack={() => back('review')} onFinish={() => void finish()} finishing={finishing} error={finishError} />
}
