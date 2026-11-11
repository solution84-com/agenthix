import { INITIALS_MARK } from '@agenthix/ui/primitives'
import { AsideCard, AsideLabel } from './OnboardingFrame'
import { initialOf } from '../../../auth/pages/parts/orgCard'
import type { InviteView } from '../../../auth/pages/parts/linkApi'

function Face({ name, square }: { name: string; square?: boolean }) {
  return (
    <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center text-small ${INITIALS_MARK} ${square ? 'rounded-lg' : 'rounded-full'}`}>{initialOf(name)}</span>
  )
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/** Beside the Join form: a few people already in the organisation and the projects they are joining — names only, nothing from inside a project. */
export function JoinAside({ view }: { view: InviteView }) {
  const org = view.org.name ?? 'the organisation'
  if (view.people.length === 0 && view.projects.length === 0) return null
  return (
    <div>
      <AsideLabel>Already at {org}</AsideLabel>
      {view.people.length > 0 && (
        <AsideCard title="People">
          <ul className="space-y-2">
            {view.people.map((p, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <Face name={p.name} />
                <span className="flex-1 text-body text-text-primary">{p.name}<span className="block text-small text-text-muted">{p.role === 'ADMIN' ? 'Admin' : 'Member'}</span></span>
              </li>
            ))}
            {view.morePeople > 0 && <li className="pl-[42px] text-small text-text-muted">and {view.morePeople} more</li>}
          </ul>
        </AsideCard>
      )}
      {view.projects.length > 0 && (
        <AsideCard title="Projects you are joining">
          <ul className="space-y-2">
            {view.projects.map(p => (
              <li key={p.key} className="flex items-center gap-2.5">
                <Face name={p.name} square />
                <span className="flex-1 text-body text-text-primary">{p.name}{p.description && <span className="block text-small text-text-muted">{p.description}</span>}</span>
                <span className="text-small text-text-muted">{people(p.memberCount)}</span>
              </li>
            ))}
          </ul>
        </AsideCard>
      )}
    </div>
  )
}
