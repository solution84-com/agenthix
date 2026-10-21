import { initialOf } from './orgCard'
import { closesText, joinNames, roleInWords, type InviteView } from './linkApi'

/** Who invited them and what they join, in words: "Avery invited you to join Acme Corp as a Member, and to Website Redesign and Merchant app". */
export function InviteSummary({ view }: { view: InviteView }) {
  const org = view.org.name ?? 'the organisation'
  const projects = joinNames(view.projects.map(p => p.name))
  const closes = closesText(view.expiresAt)
  const label = view.note ? `Invitation for "${view.note}"` : 'Invitation'
  const who = view.invitedBy?.name ?? (view.fromHqMachine ? "Someone on HQ's machine" : 'An admin')
  return (
    <div className="mb-5 flex items-start gap-3">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-body font-semibold text-on-accent">{initialOf(view.invitedBy?.name ?? null)}</span>
      <div className="text-body text-text-secondary">
        <b className="font-medium text-text-primary">{who}</b> invited you to join <b className="font-medium text-text-primary">{org}</b> as {roleInWords(view.role)}
        {projects && <>, and to <b className="font-medium text-text-primary">{projects}</b></>}.
        <div className="mt-0.5 text-small text-text-muted">{label}{closes ? ` · ${closes}` : ''}</div>
      </div>
    </div>
  )
}
