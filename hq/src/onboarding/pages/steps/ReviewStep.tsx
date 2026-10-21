import type { ReactNode } from 'react'
import { PersonFace } from '../../../org/pages/people/PersonFace'
import { ModelAccessRows } from '../../../model-access/pages/ModelAccessRows'
import { useModelAccess } from '../../../model-access/pages/useModelAccess'
import { StateLine, Heading, TEXT_LINK } from '../../../auth/pages/parts/authUi'
import { joinNames } from '../../../auth/pages/parts/linkApi'
import type { OnboardingData } from '../../queries'
import { AsideLabel, OnboardingFrame, StepButtons } from './OnboardingFrame'
import { browserZone } from './zones'

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

/** A last look: them, their model access, what they are joining — each with Edit — then Start working. */
export function ReviewStep({ data, onEdit, onBack, onStart, starting }: {
  data: OnboardingData
  onEdit: (step: 'you' | 'model') => void
  onBack: () => void
  onStart: () => void
  starting: boolean
}) {
  const { me } = data
  const mine = { ownerType: 'user' as const, ownerId: me.id }
  const { loaded, set } = useModelAccess(mine, mine)
  const name = me.displayName ?? me.username ?? ''
  const first = data.projects[0]
  const aside = (
    <div>
      <AsideLabel>Where you will land</AsideLabel>
      <div className="rounded-xl border border-border px-3.5 py-3 text-body text-text-secondary">
        {first
          ? <><b className="font-medium text-text-primary">{first.name}</b>, with its message box ready{data.projects.length > 1 ? ` and ${joinNames(data.projects.map(p => p.name))} pinned` : ''}.</>
          : <>Home, where you can start a conversation.</>}
      </div>
    </div>
  )
  return (
    <OnboardingFrame identity={data.identity} step="review" needsModel={data.needsModel} aside={aside}>
      <Heading title="Check everything before you start" lead="Change anything here; you can also change it later." />
      <Section title="You" onEdit={() => onEdit('you')}>
        <div className="flex items-center gap-2.5">
          <PersonFace person={{ userId: me.id, name, avatarUrl: me.avatarUrl }} />
          <div className="text-body text-text-primary">{name}<span className="text-text-muted"> · @{me.username}</span>
            <div className="text-small text-text-muted">{me.timezone ?? browserZone()}</div>
          </div>
        </div>
      </Section>
      <Section title="Model access" onEdit={data.needsModel ? () => onEdit('model') : undefined}>
        {!data.needsModel ? (
          <div className="text-body text-text-primary"><span className="text-success">✓</span> Provided by {data.orgName}
            <div className="text-small text-text-muted">Your own conversations use the organisation's access.</div>
          </div>
        ) : !loaded ? <div className="text-small text-text-muted">Checking…</div> : set.length === 0 ? (
          <StateLine tone="warn"><b className="font-medium text-text-primary">Not set</b> — agents can't answer until one is set</StateLine>
        ) : <ModelAccessRows items={set} />}
      </Section>
      <Section title="Joining">
        <div className="text-body text-text-primary">{data.role === 'ADMIN' ? 'Admin' : 'Member'} of {data.orgName}
          {data.projects.length > 0 && <div className="text-small text-text-muted">{joinNames(data.projects.map(p => p.name))}{data.invitedBy ? ` — set by ${data.invitedBy}'s invitation` : ''}</div>}
        </div>
      </Section>
      <StepButtons onBack={onBack} nextLabel={starting ? 'Starting…' : 'Start working'} onNext={onStart} busy={starting} />
    </OnboardingFrame>
  )
}
