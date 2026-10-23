import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, getSetupData, getSetupResume, getAiProviders, completeSetup } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { YouStep } from './steps/YouStep'
import { ChoiceStep } from './steps/ChoiceStep'
import { ModelStep, VoiceStep } from './steps/ProviderSteps'
import { OrgStep } from './steps/OrgStep'
import { ReviewStep } from './steps/ReviewStep'
import { neighbour, pathFromParam, position, stepFromParam, stepOfResume, stepParam, type Path, type Step } from './setupSteps'

/** Where models and voice come from, for the last look. */
function aiWordsOf(path: Path, providers: AiProviderSummary[]): string {
  if (path === 'cloud') return 'Agenthix Cloud, connected by you.'
  const own = providers.filter(p => p.vendor !== 'cloud').map(p => p.name)
  return own.length ? `Your own keys: ${own.join(', ')}.` : 'Your own keys.'
}

/**
 * Setup, once per HQ, for the first admin: You, how agents reach AI (Agenthix Cloud, or your own keys with a model
 * provider and voice), Your organisation, then a last look. It opens at the step `getSetupResume` names, and finishing
 * lands on Home, where the built-in agent waits.
 */
export function SetupPage() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useQuery(getSetupData)
  const { data: resume } = useQuery(getSetupResume)
  const { data: providers } = useQuery(getAiProviders)
  const [params, setParams] = useSearchParams()
  const hasOwnKeys = providers?.some(p => p.vendor !== 'cloud') ?? false
  const path: Path = pathFromParam(params.get('path')) ?? (hasOwnKeys ? 'keys' : 'cloud')
  const step: Step | null = stepFromParam(params.get('step')) ?? (resume ? stepOfResume(resume.step) : null)
  // Editing from the last look (&then=review) returns there instead of going on in order.
  const backToReview = params.get('then') === 'review' && step !== 'review'
  const go = (next: Step, also: Record<string, string> = {}) => setParams({ step: stepParam(next), path, ...also })
  const advance = async (from: Step) => {
    if (!backToReview) { go(neighbour(path, from, 1)); return }
    await refetch()
    go('review')
  }
  const back = (from: Step) => go(backToReview ? 'review' : neighbour(path, from, -1))
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
    } catch (err) {
      const conflict = err instanceof Error && /409|Add a model provider/.test(err.message)
      setFinishError(conflict ? 'Models and voice are not working yet. Go back and add a provider that works.' : 'Could not finish setup. Please try again.')
      setFinishing(false)
    }
  }

  const orgName = saved?.name ?? data.org?.name ?? ''
  const avatarUrl = saved ? saved.avatarUrl : data.org?.avatarUrl ?? null
  const coverUrl = saved ? saved.coverUrl : data.org?.coverUrl ?? null
  const timeZone = saved?.timeZone ?? data.org?.timeZone ?? 'UTC'
  const here = position(path, step)

  if (step === 'you') return <YouStep me={data.me} position={here} onNext={() => void advance('you')} />
  if (step === 'choice') {
    return <ChoiceStep position={here} onBack={() => back('choice')} onOwnKeys={() => go('model', { path: 'keys' })} onCloudConnected={() => go('org', { path: 'cloud' })} />
  }
  if (step === 'model') return <ModelStep position={here} providers={providers} onNext={() => void advance('model')} onBack={() => back('model')} />
  if (step === 'voice') return <VoiceStep position={here} providers={providers} onNext={() => void advance('voice')} onBack={() => back('voice')} />
  if (step === 'org') {
    return <OrgStep position={here} initialName={orgName} initialTimeZone={timeZone} avatarUrl={avatarUrl} coverUrl={coverUrl} onBack={() => back('org')} onNext={now => { setSaved(now); void advance('org') }} />
  }
  return <ReviewStep position={here} aiWords={aiWordsOf(path, providers)} timeZone={timeZone} me={data.me} orgName={data.org?.name ?? ''} avatarUrl={data.org?.avatarUrl ?? null} coverUrl={data.org?.coverUrl ?? null} hqSite={data.hqSite} onCheckAgain={() => void refetch()} onEdit={edit} onBack={() => back('review')} onFinish={() => void finish()} finishing={finishing} error={finishError} />
}
