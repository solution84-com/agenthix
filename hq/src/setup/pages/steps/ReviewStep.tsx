import type { ReactNode } from 'react'
import { useQuery, getSetupDefaults } from 'wasp/client/operations'
import { providerStateWorks, providerTypesCovered, type AiProviderSummary } from '@agenthix/core'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Heading, PRIMARY, SECONDARY, StateLine, Steps, TEXT_LINK } from '../../../auth/pages/parts/authUi'
import type { HqSiteState } from '../../hqSiteState'
import { HqSiteWarning } from './HqSiteLine'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { SignInPreview } from './SignInPreview'
import { KernelLine } from './DefaultsSection'
import { ShowAttention } from '@agenthix/ui/attention'

type Props = {
  me: { id: string; displayName: string | null; username: string | null }
  orgName: string
  avatarUrl: string | null
  coverUrl: string | null
  hqSite: HqSiteState
  timeZone: string
  position: { step: number; total: number }
  providers: AiProviderSummary[]
  onCheckAgain: () => void
  onEdit: (step: 'you' | 'org' | 'ai') => void
  onBack: () => void
  onFinish: () => void
  finishing: boolean
  error: string
}

function Section({ title, onEdit, editLabel, children }: { title: string; onEdit?: () => void; editLabel?: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-xl border border-border px-3.5 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-small font-medium text-text-muted">{title}</h2>
        {onEdit && <button type="button" onClick={onEdit} aria-label={editLabel} className={`${TEXT_LINK} text-small`}>Edit</button>}
      </div>
      {children}
    </section>
  )
}

function Thumb({ label, src, wide }: { label: string; src: string | null; wide?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-micro text-text-muted">{label}</div>
      <span className={`${wide ? 'w-24' : 'w-9'} relative block h-9 overflow-hidden rounded-lg bg-surface-2`}>
        {src ? <AuthedImg src={src} alt={`Your ${label.toLowerCase()}`} className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-micro text-text-muted">None</span>}
      </span>
    </div>
  )
}

/** The covered list as one phrase: "Model, hearing and speaking". */
function joinWords(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('')
}

/** What works, and what is not set, in words (ADR-0160): a type nothing covers is a plain "Not set", not a fault. */
function AiSummary({ providers }: { providers: AiProviderSummary[] }) {
  const covered = providerTypesCovered(providers)
  if (providers.length === 0) {
    return <StateLine tone="warn"><b className="font-medium text-text-primary">Not set up.</b> Agents can&rsquo;t think or talk until you add a provider.</StateLine>
  }
  // A provider that offers models is not enough: the model is "set" once a default model exists (the data the AI step shows).
  const { data: defaults } = useQuery(getSetupDefaults)
  const modelPending = covered.llm && !defaults?.conversation
  const kinds = [['Model', covered.llm && !modelPending], ['Hearing', covered.stt], ['Speaking', covered.tts]] as const
  const set = kinds.filter(([, on]) => on).map(([label], i) => (i === 0 ? label : label.toLowerCase()))
  return (
    <>
      {providers.map(p => (
        <StateLine key={p.id} tone={providerStateWorks(p.state) ? 'ok' : 'warn'}>
          <b className="font-medium text-text-primary">{p.name}</b> {providerStateWorks(p.state) ? 'works.' : 'is not working.'}
        </StateLine>
      ))}
      <ul className="mt-2 space-y-0.5 text-small text-text-secondary">
        {set.length > 0 && <li>{joinWords(set)} set.</li>}
        {kinds.filter(([, on]) => !on).map(([label]) => (
          label === 'Model' && modelPending ? <li key={label}>Model not set yet.</li> : <li key={label}>{label}: Not set.</li>
        ))}
      </ul>
    </>
  )
}

/** Setup's last step: everything the earlier steps set, in their order, read from the server, each with a way back to change it. */
export function ReviewStep({ timeZone, position, providers, me, orgName, avatarUrl, coverUrl, hqSite, onCheckAgain, onEdit, onBack, onFinish, finishing, error }: Props) {
  const covered = providerTypesCovered(providers)
  const thinks = covered.llm
  return (
    <AuthLayout setup side={<SignInPreview name={orgName} pictureSrc={avatarUrl} coverSrc={coverUrl} />}>
      <Steps step={position.step} total={position.total} name="Last look" />
      <Heading title="Check everything before you start" lead="Change anything here; you can also change it later." />
      <Section title="You" editLabel="Edit your details" onEdit={() => onEdit('you')}>
        <div className="text-body text-text-primary">{me.displayName}</div>
        <div className="text-small text-text-muted">{me.username}</div>
      </Section>
      <Section title="Your organisation" editLabel="Edit your organisation" onEdit={() => onEdit('org')}>
        <div className="mb-2 text-body text-text-primary">{orgName} <span className="text-small text-text-muted">· {timeZone}</span></div>
        <div className="flex items-end gap-4">
          <Thumb label="Picture" src={avatarUrl} />
          <Thumb label="Cover" src={coverUrl} wide />
        </div>
      </Section>
      <Section title="AI" editLabel="Edit AI" onEdit={() => onEdit('ai')}>
        <AiSummary providers={providers} />
        <div className="mt-1 text-small text-text-muted">Change providers and what agents use any time under Manage › Providers and Manage › Models.</div>
      </Section>
      <Section title="Your first agent">
        <KernelLine speaks={covered.tts} />
        {!thinks && <div className="text-small text-text-muted">Answers once a model provider is added.</div>}
      </Section>
      <Section title="Where agents run">
        {hqSite.state === 'connected'
          ? <div className="text-small text-text-primary">HQ's site — running on this machine</div>
          : <HqSiteWarning connected={false} onCheckAgain={onCheckAgain} />}
      </Section>
      <ShowAttention kind="alert" text={error} title="Setup was not finished" />
      <ActionRow>
        <button type="button" disabled={finishing} onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" disabled={finishing} onClick={onFinish} className={`${PRIMARY} flex-1`}>{finishing ? 'Finishing…' : 'Finish'}</button>
      </ActionRow>
    </AuthLayout>
  )
}
