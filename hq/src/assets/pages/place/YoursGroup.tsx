import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { YoursView, YourSkill } from '../../places/yours'

export type { YoursView, YourSkill }

/** Inside a project (boards, *A place's skills*): the person's own group, private to them, with one line on clashes. */
export function YoursInProject({ yours, manageHref }: { yours: YoursView; manageHref: string }) {
  if (yours.skills.length === 0) return null
  return (
    <section className="mt-6" aria-label="Yours · private to you" data-testid="yours-group">
      <h3 className="text-body font-medium text-text-primary">Yours · private to you</h3>
      <p className="text-small text-text-muted">Only you see Yours; it applies when you talk to an agent here. The project's skills win a clash.</p>
      <div className="mt-1">
        {yours.skills.map((s) => (
          <div key={s.id} className="border-t border-border-subtle py-3 first:border-t-0" data-testid="yours-row">
            <div className="text-body font-medium text-text-primary">{s.name}</div>
            <div className="text-small text-text-muted">
              {s.setAsideIn.length ? `From Your space · set aside here: this project's own ${s.name} is used instead` : 'From Your space · on'}
              {s.agentName ? ` · ${s.agentName} only` : ''}{s.version !== null ? ` · version ${s.version}` : ''}
            </div>
          </div>
        ))}
      </div>
      <Link to={manageHref} className={`rounded text-small text-link hover:underline ${FOCUS_RING}`}>Manage in Your space</Link>
    </section>
  )
}

/** Your space's banner (board P2): that your skills follow you, or that the organisation keeps them home. */
export function YoursBanner({ outside, orgName }: { outside: boolean; orgName?: string }) {
  const who = orgName ?? 'The organisation'
  return outside ? (
    <div role="note" className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-small text-text-secondary" data-testid="yours-banner">
      <strong className="text-text-primary">Your skills follow you.</strong> The ones switched on here also apply in your own conversations in any project you work in. They never apply to runs someone else starts, or to scheduled ones. {who} allows this · Personal skills outside Your space: on
    </div>
  ) : (
    <div role="note" className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-small text-text-secondary" data-testid="yours-banner">
      <strong className="text-text-primary">Your skills stay in Your space.</strong> {who} keeps personal skills to Your space, so they apply only when an agent works with you here. Personal skills outside Your space: off · set by an administrator
    </div>
  )
}

/** Where a skill of yours is set aside, for Your space's rows. */
export function WhereLine({ skill }: { skill: YourSkill }) {
  if (skill.setAsideIn.length === 0) return null
  return <span className="text-small text-text-secondary" data-testid="yours-where">In {skill.setAsideIn.join(', ')}, the project's own {skill.name} is used instead.</span>
}
