import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, getSetupData, completeSetup } from 'wasp/client/operations'
import { YouStep } from './steps/YouStep'
import { OrgStep } from './steps/OrgStep'
import { ModelStep } from './steps/ModelStep'
import { ReviewStep } from './steps/ReviewStep'

type Step = 'you' | 'org' | 'model' | 'review'

// The step is carried in the address (?step=model), so a refresh and Back/Forward keep it. Anything else is the start.
const STEP_PARAM: Record<Step, string> = { you: 'you', org: 'organisation', model: 'model', review: 'review' }
const stepFromParam = (value: string | null): Step => (Object.keys(STEP_PARAM) as Step[]).find(k => STEP_PARAM[k] === value) ?? 'you'

/**
 * Setup, once per HQ, for the first admin (getting-in spec): You (the account is made on
 * the first-admin link's page; here it is reviewed), Your organisation, Model access, then a Review of all three.
 * Finishing lands on Home, where the built-in agent waits.
 */
export function SetupPage() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery(getSetupData)
  const [params, setParams] = useSearchParams()
  const step = stepFromParam(params.get('step'))
  // Editing from the review (&then=review) returns there instead of going on in order.
  const backToReview = params.get('then') === 'review' && step !== 'review'
  const setStep = (next: Step) => setParams({ step: STEP_PARAM[next] })
  const edit = (next: Step) => setParams({ step: STEP_PARAM[next], then: 'review' })
  const advance = async (next: Step) => {
    if (!backToReview) { setStep(next); return }
    await refetch()
    setStep('review')
  }
  const back = (prev: Step) => setStep(backToReview ? 'review' : prev)
  // What step 2 saved; the query is not refetched by it, so the next step's preview reads these.
  const [saved, setSaved] = useState<{ name: string; avatarUrl: string | null; coverUrl: string | null } | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState('')

  // Setup is done, or is not this person's: nothing here for them.
  useEffect(() => { if (data && !data.needsSetup) navigate('/', { replace: true }) }, [data, navigate])

  if (isLoading || !data || !data.needsSetup) return <div className="min-h-screen bg-surface-1" />

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

  if (step === 'you') return <YouStep me={data.me} onNext={() => void advance('org')} />
  if (step === 'org') {
    return <OrgStep initialName={orgName} avatarUrl={avatarUrl} coverUrl={coverUrl} onBack={backToReview ? () => back('you') : () => setStep('you')} onNext={now => { setSaved(now); void advance('model') }} />
  }
  if (step === 'model') {
    return <ModelStep onBack={() => back('org')} orgName={orgName} avatarUrl={avatarUrl} coverUrl={coverUrl} hqSite={data.hqSite} onCheckAgain={() => void refetch()} onNext={() => void advance('review')} />
  }
  return <ReviewStep me={data.me} orgName={data.org?.name ?? ''} avatarUrl={data.org?.avatarUrl ?? null} coverUrl={data.org?.coverUrl ?? null} hqSite={data.hqSite} onCheckAgain={() => void refetch()} onEdit={edit} onBack={() => setStep('model')} onFinish={() => void finish()} finishing={finishing} error={finishError} />
}
