import type { ReactNode } from 'react'
import { providerTypesCovered, type AiProviderSummary } from '@agenthix/core'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { ActionRow, Heading, PRIMARY, SECONDARY, StateLine, Steps, TEXT_LINK } from '../../../auth/pages/parts/authUi'
import type { HqSiteState } from '../../hqSiteState'
import { HqSiteWarning } from './HqSiteLine'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { SignInPreview } from './SignInPreview'
import { DefaultsSection, KernelLine } from './DefaultsSection'
import type { Path } from '../setupSteps'

type Props = {
  me: { id: string; displayName: string | null; username: string | null }
  orgName: string
  avatarUrl: string | null
  coverUrl: string | null
  hqSite: HqSiteState
  timeZone: string
  position: { step: number; total: number }
  path: Path
  providers: AiProviderSummary[]
  onCheckAgain: () => void
  onEdit: (step: 'you' | 'org' | 'choice') => void
  onBack: () => void
  onFinish: () => void
  finishing: boolean
  error: string
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-xl border border-border px-3.5 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-small font-medium text-text-muted">{title}</h2>
        {onEdit && <button type="button" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`} className={`${TEXT_LINK} text-small`}>Edit</button>}
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

/** Where models and voice come from, and what is not set up yet, in words (ADR-0160). */
function AiSummary({ path, providers }: { path: Path; providers: AiProviderSummary[] }) {
  const covered = providerTypesCovered(providers)
  const own = providers.filter(p => p.vendor !== 'cloud').map(p => p.name)
  const from = path === 'cloud' ? 'Agenthix Cloud, connected by you.' : `Your own keys: ${own.join(', ')}.`
  const voice = covered.stt && covered.tts
  if (providers.length === 0) {
    return <StateLine tone="warn"><b className="font-semibold text-text-primary">Not set up.</b> Agents can&rsquo;t think or talk until you add a provider.</StateLine>
  }
  return (
    <>
      <div className="text-body text-text-primary">{from}</div>
      {!covered.llm && <StateLine tone="warn">Agents can&rsquo;t think until you add a model provider.</StateLine>}
      {covered.llm && !voice && <StateLine tone="warn">Voice isn&rsquo;t set up, so people type to agents.</StateLine>}
    </>
  )
}

/** Setup's last step: everything the earlier steps set, in their order, read from the server, each with a way back to change it. */
export function ReviewStep({ timeZone, position, path, providers, me, orgName, avatarUrl, coverUrl, hqSite, onCheckAgain, onEdit, onBack, onFinish, finishing, error }: Props) {
  const thinks = providerTypesCovered(providers).llm
  return (
    <AuthLayout setup side={<SignInPreview name={orgName} pictureSrc={avatarUrl} coverSrc={coverUrl} />}>
      <Steps step={position.step} total={position.total} name="Last look" />
      <Heading title="Check everything before you start" lead="Change anything here; you can also change it later." />
      <Section title="You" onEdit={() => onEdit('you')}>
        <div className="text-body text-text-primary">{me.displayName}</div>
        <div className="text-small text-text-muted">{me.username}</div>
      </Section>
      <Section title="Your organisation" onEdit={() => onEdit('org')}>
        <div className="mb-2 text-body text-text-primary">{orgName} <span className="text-small text-text-muted">· {timeZone}</span></div>
        <div className="flex items-end gap-4">
          <Thumb label="Picture" src={avatarUrl} />
          <Thumb label="Cover" src={coverUrl} wide />
        </div>
      </Section>
      <Section title="Models and voice" onEdit={() => onEdit('choice')}>
        <AiSummary path={path} providers={providers} />
        <div className="mt-1 text-small text-text-muted">{providers.length ? 'Change providers' : 'Add one'} any time under Manage › Providers.</div>
      </Section>
      <Section title="Defaults for everyone">
        {providers.length
          ? <><DefaultsSection /><div className="text-small text-text-muted">Change these any time under Manage › Models.</div></>
          : <div className="text-small text-text-muted">Chosen for you when you add a provider.</div>}
      </Section>
      <Section title="Your first agent">
        <KernelLine />
        {!thinks && <div className="text-small text-text-muted">Answers once a model provider is added.</div>}
      </Section>
      <Section title="Where agents run">
        {hqSite.state === 'connected'
          ? <div className="text-small text-text-primary">HQ's site — running on this machine</div>
          : <HqSiteWarning connected={false} onCheckAgain={onCheckAgain} />}
      </Section>
      {error && <p role="alert" className="mb-3.5 rounded-lg border border-danger/40 px-3 py-2 text-small text-danger">{error}</p>}
      <ActionRow>
        <button type="button" disabled={finishing} onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" disabled={finishing} onClick={onFinish} className={`${PRIMARY} flex-1`}>{finishing ? 'Finishing…' : 'Finish'}</button>
      </ActionRow>
    </AuthLayout>
  )
}
