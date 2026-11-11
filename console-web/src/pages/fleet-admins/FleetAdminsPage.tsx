/**
 * Fleet admins (boards *The fleet admin role*, *Signing in, and fleet admins*): the HQ accounts that hold the role,
 * giving it to another HQ account and removing it. HQ is the authority over the role, announces every change, and
 * refuses one from anyone who does not hold it; the Fleet Console keeps nothing about these people.
 */
import { useState } from 'react'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { useAuth } from '../../auth/AuthContext'
import { useSessionDetails } from '../../auth/useSessionDetails'
import type { FleetAdmin } from '../../api/session'
import { Card, HowThisWorks, ListTitleRow, Notice } from '../../components'
import { CloudFleetAdmins } from '../../cloud/CloudFleetAdmins'
import { GiveRoleModal } from './GiveRoleModal'
import { RemoveRoleModal } from './RemoveRoleModal'
import { dayOf, GIVE_COMMAND, possessive, useFleetAdmins } from './useFleetAdmins'

export function FleetAdminsPage() {
  const { state } = useAuth()
  const meId = state.phase === 'signedIn' ? state.user.id : null
  const details = useSessionDetails()
  const org = details?.hq?.organisationName ?? null
  const address = details?.hq?.address ?? null
  const { admins, problem, reload } = useFleetAdmins()
  const [giving, setGiving] = useState(false)
  const [removing, setRemoving] = useState<FleetAdmin | null>(null)

  return (
    <div className="max-w-4xl">
      <ListTitleRow
        title="Fleet admins"
        help={<HowThisWorks topic="hq-sites-and-fleet-admins" section="fleet-admins" />}
        lede={`Accounts in HQ that hold the fleet admin role. They look after ${org ? possessive(org) : "the organisation's"} own machines here. The role is not the organisation admin role: giving one does not give the other.`}
        add={<Button onClick={() => setGiving(true)}>Give the role to…</Button>}
      />
      {problem && <Notice kind="alert" title="The list could not be read" retry={reload}>{problem}</Notice>}
      {admins && (
        <Card>
          <ul aria-label="Fleet admins">
            {admins.map(a => (
              <li key={a.id} aria-label={a.name} className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-small text-text-primary">
                    <b className="font-semibold">{a.name}</b>{a.id === meId && <span className="text-text-muted"> · you</span>}
                    {a.username && <code className="ml-2 font-mono text-micro text-text-muted">{a.username}</code>}
                  </p>
                  {a.since && <p className="text-micro text-text-muted">Has held the role since {dayOf(a.since)}</p>}
                </div>
                {a.organisationAdmin && <StatePill>Organisation admin</StatePill>}
                <StatePill tone="healthy">Fleet admin</StatePill>
                <Button variant="danger" size="sm" onClick={() => setRemoving(a)}>Remove the role</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CloudFleetAdmins org={org} onGive={() => setGiving(true)} />

      <div className="mt-4 space-y-1.5 text-small text-text-secondary">
        <p>
          Only a fleet admin, here, or a machine admin of HQ's machine, who runs <code className="font-mono text-[.92em] text-text-primary">{GIVE_COMMAND}</code> there,
          can give the role. An organisation admin cannot give it.
        </p>
        <p>Every grant and removal is announced to every fleet admin and organisation admin, and recorded in Activity.</p>
        <p className="text-text-muted">Name and password belong to HQ. To change either, use Your account.</p>
      </div>

      <GiveRoleModal open={giving} org={org} address={address} onClose={() => setGiving(false)} onGiven={() => { setGiving(false); reload() }} />
      {removing && (
        <RemoveRoleModal
          admin={removing} isMe={removing.id === meId} onlyOne={(admins?.length ?? 0) <= 1}
          onClose={() => setRemoving(null)} onRemoved={() => { setRemoving(null); reload() }}
        />
      )}
    </div>
  )
}
