import { useState } from 'react'
import { useAction, revokeInvite } from 'wasp/client/operations'
import type { InvitationView } from '../../../auth/invitationViews'
import { PersonFace } from './PersonFace'
import { CELL, ROW_GRID } from './PeopleList'
import { orgRoleLabel, expiryText, invitedProjectsText, shortDate } from './peopleFormat'
import { BRANDING } from '@agenthix/core'
import { COPY_FAILED_WORDS } from '../../../shared/copyText'
import { useCopy } from '../../../shared/hooks/useCopy'

function WaitingRow({ invite, link, now }: { invite: InvitationView; link: string | undefined; now: Date }) {
  const revoke = useAction(revokeInvite)
  const copier = useCopy()
  const [error, setError] = useState<string | null>(null)
  const projects = invitedProjectsText(invite.projects, invite.hiddenProjectCount)

  async function copy() {
    if (link) await copier.copy(link)
  }

  async function onRevoke() {
    if (!confirm('Revoke this invitation? Its link stops working.')) return
    try { await revoke({ inviteId: invite.id }) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <li className={`${ROW_GRID} px-2 py-3`}>
      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-small font-semibold text-text-secondary">?</span>
      <div className="min-w-0">
        <div className="truncate text-body font-medium text-text-primary">{invite.forWhom ?? 'Not named'}</div>
        <div className="truncate text-small text-text-muted">{invite.invitedBy ? `Invited by ${invite.invitedBy.name}` : "Invited from HQ's machine"} · {expiryText(invite.expiresAt, now)}</div>
        {error && <div role="alert" className="text-small text-danger">{error}</div>}
        {copier.state === 'failed' && <div role="alert" className="text-small text-danger">{COPY_FAILED_WORDS}</div>}
      </div>
      <div className={`${CELL} text-text-secondary`}>{orgRoleLabel(invite.role)}</div>
      <div className={`${CELL} truncate text-text-secondary`} title={projects ?? undefined}>{projects ?? 'No project'}</div>
      <div className={`${CELL} flex items-center gap-3 md:justify-end`}>
        {link && <button type="button" onClick={() => void copy()} className="font-medium text-accent hover:text-accent-hover">{copier.state === 'copied' ? 'Copied' : 'Copy link'}</button>}
        <button type="button" onClick={() => void onRevoke()} className="text-danger hover:underline">Revoke</button>
      </div>
    </li>
  )
}

export function WaitingInvitations({ invitations, links }: { invitations: InvitationView[]; links: Record<string, string> }) {
  const now = new Date()
  const withoutLink = invitations.some(i => !links[i.id])
  return (
    <section aria-label="Invited, waiting" className="mb-8">
      <h2 className="flex justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
        <span>Invited · waiting</span><span className="font-normal normal-case tracking-normal">{invitations.length}</span>
      </h2>
      <ul className="mt-1 divide-y divide-border-subtle">
        {invitations.map(i => <WaitingRow key={i.id} invite={i} link={links[i.id]} now={now} />)}
      </ul>
      {withoutLink && (
        <p className="mt-1 text-small text-text-muted">
          An invitation's link is shown once, when it is made, and {BRANDING.displayName} keeps only a fingerprint of it. If one is lost, revoke it and invite again.
        </p>
      )}
    </section>
  )
}

const EARLIER: Record<InvitationView['state'], (i: InvitationView) => string> = {
  waiting: () => '',
  used: i => `Accepted${i.usedBy ? ` by ${i.usedBy.name}` : ''} on ${shortDate(i.usedAt)}`,
  expired: i => `Expired ${shortDate(i.expiresAt)}`,
  revoked: () => 'Revoked',
}

export function EarlierInvitations({ invitations }: { invitations: InvitationView[] }) {
  return (
    <details className="mb-8">
      <summary className="cursor-pointer text-micro font-medium uppercase tracking-wide text-text-muted">
        Earlier invitations <span className="ml-1 normal-case">{invitations.length}</span>
      </summary>
      <ul className="mt-1 divide-y divide-border-subtle">
        {invitations.map(i => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
            {i.usedBy && <PersonFace person={i.usedBy} size="sm" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-text-primary">{i.forWhom ?? 'Not named'}</div>
              <div className="truncate text-small text-text-muted">{orgRoleLabel(i.role)} · {i.invitedBy ? `invited by ${i.invitedBy.name}` : "invited from HQ's machine"} · {EARLIER[i.state](i)}</div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
