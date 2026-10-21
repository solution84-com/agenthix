import type { ReactNode } from 'react'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { Heading, PRIMARY, SECONDARY, StateLine, Steps, TEXT_LINK } from '../../../auth/pages/parts/authUi'
import { ModelAccessRows } from '../../../model-access/pages/ModelAccessRows'
import { useModelAccess } from '../../../model-access/pages/useModelAccess'
import type { HqSiteState } from '../../hqSiteState'
import { HqSiteWarning } from './HqSiteLine'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { SignInPreview } from './SignInPreview'
import { CloudSetupLine } from './CloudSetupLine'

type Props = {
  me: { id: string; displayName: string | null; username: string | null }
  orgName: string
  avatarUrl: string | null
  coverUrl: string | null
  hqSite: HqSiteState
  onCheckAgain: () => void
  onEdit: (step: 'you' | 'org' | 'model') => void
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

/** Setup's last step: everything the earlier steps set, read from the server, each with a way back to change it. */
export function ReviewStep({ me, orgName, avatarUrl, coverUrl, hqSite, onCheckAgain, onEdit, onBack, onFinish, finishing, error }: Props) {
  const { loaded, set } = useModelAccess({ ownerType: 'org', ownerId: 'org' }, { ownerType: 'user', ownerId: me.id })
  return (
    <AuthLayout setup side={<SignInPreview name={orgName} pictureSrc={avatarUrl} coverSrc={coverUrl} />}>
      <Steps step={4} />
      <Heading title="Check everything before you start" lead="Change anything here; you can also change it later." />
      <Section title="You" onEdit={() => onEdit('you')}>
        <div className="text-body text-text-primary">{me.displayName}</div>
        <div className="text-small text-text-muted">{me.username}</div>
      </Section>
      <Section title="Your organisation" onEdit={() => onEdit('org')}>
        <div className="mb-2 text-body text-text-primary">{orgName}</div>
        <div className="flex items-end gap-4">
          <Thumb label="Picture" src={avatarUrl} />
          <Thumb label="Cover" src={coverUrl} wide />
        </div>
      </Section>
      <Section title="Where agents run">
        {hqSite.state === 'connected'
          ? <div className="text-small text-text-primary">HQ's site — running on this machine</div>
          : <HqSiteWarning connected={false} onCheckAgain={onCheckAgain} />}
        <CloudSetupLine />
      </Section>
      <Section title="Model access" onEdit={() => onEdit('model')}>
        {!loaded ? <div className="text-small text-text-muted">Checking…</div> : set.length === 0 ? (
          <StateLine tone="warn"><b className="font-medium text-text-primary">Not set</b> — agents can't answer until one is set</StateLine>
        ) : <ModelAccessRows items={set} />}
      </Section>
      {error && <p role="alert" className="mb-3.5 rounded-lg border border-danger/40 px-3 py-2 text-small text-danger">{error}</p>}
      <div className="mt-5 flex items-center gap-3">
        <button type="button" disabled={finishing} onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" disabled={finishing} onClick={onFinish} className={`${PRIMARY} flex-1`}>{finishing ? 'Finishing…' : 'Finish'}</button>
      </div>
    </AuthLayout>
  )
}
