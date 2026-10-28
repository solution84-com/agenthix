import { Link } from 'react-router'
import type { YoursView, YourSkill } from '../../places/yours'

export type { YoursView, YourSkill }

/** Inside a project (board P2, *What you see inside a project*): the person's own group, private to them. */
export function YoursInProject({ yours, manageHref }: { yours: YoursView; manageHref: string }) {
  if (yours.skills.length === 0) return null
  return (
    <section className="mt-6" aria-label="Yours, in your conversations" data-testid="yours-group">
      <h3 className="text-body font-semibold text-text-primary">Yours, in your conversations <span className="ml-2 text-small font-normal text-text-muted">private to you</span></h3>
      <p className="text-small text-text-muted">Only you see this group. It applies when you talk to an agent here; the project's skills win a clash.</p>
      <div className="mt-1">
        {yours.skills.map((s) => (
          <div key={s.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-border-subtle py-3 first:border-t-0" data-testid="yours-row">
            <span className="text-body font-medium text-text-primary">{s.name}</span>
            <span className="text-small text-text-muted">
              {s.setAsideIn.length ? 'set aside here' : 'yours'}{s.agentName ? ` · ${s.agentName} only` : ''}{s.version !== null ? ` · version ${s.version}` : ''}
            </span>
            {s.setAsideIn.length > 0 && <span className="w-full text-small text-text-secondary">This project's own {s.name} is used instead.</span>}
          </div>
        ))}
      </div>
      <Link to={manageHref} className="text-small text-accent hover:text-accent-hover">Manage in Your space</Link>
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
