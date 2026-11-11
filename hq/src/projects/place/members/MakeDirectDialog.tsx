import { useState } from 'react'
import { useAction, addProjectMember } from 'wasp/client/operations'
import { Button, Modal, CARD_CHOSEN, CARD_CLICKABLE } from '@agenthix/ui/primitives'
import type { PersonMember, ProjectRole } from '../../memberList'
import type { Attention } from '../../../shared/components/AttentionDialog'
import { reasonOf } from '../people/peopleErrors'
import { ROLE_WORD, higherRoles, ownRoleNote, teamRoleOf } from './memberWords'

const BY_RANK: readonly ProjectRole[] = ['ADMIN', 'MEMBER', 'VIEWER']

/**
 * Raising someone here only through a team: they become a member in their own right, with a role of their own, and
 * the higher of theirs and the team's applies (adr-0103). Only a role higher than the team's can be chosen, since a
 * lower one would change nothing.
 */
export function MakeDirectDialog({ projectId, person, onClose, onDone, onProblem }: {
  projectId: string
  person: PersonMember
  onClose: () => void
  onDone: () => void
  onProblem: (attention: Attention) => void
}) {
  const add = useAction(addProjectMember)
  const offered = higherRoles(person.teams)
  const [role, setRole] = useState<ProjectRole | null>(offered.includes('ADMIN') ? 'ADMIN' : offered[0] ?? null)
  const [busy, setBusy] = useState(false)
  const teams = person.teams.map(t => t.name).join(', ')
  const teamRole = teamRoleOf(person.teams)

  const confirm = async () => {
    if (!role) return
    setBusy(true)
    try {
      await add({ projectId, userId: person.id, role })
      onDone()
    } catch (err) {
      onProblem({ text: reasonOf(err, `${person.name} was not made a direct member. Nothing was changed.`), retry: () => void confirm() })
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Make ${person.name} a direct member`}>
      <div className="space-y-4">
        <p className="text-body text-text-secondary">
          {person.name} is here as {teamRole ? ROLE_WORD[teamRole] : 'a member'} through {teams}. As a direct member they also have a role
          of their own; the higher of the two applies.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="pb-1 text-small font-medium text-text-primary">Their own role</legend>
          {BY_RANK.map(r => {
            const allowed = offered.includes(r)
            return (
              <label key={r} className={`flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 ${allowed ? `cursor-pointer ${CARD_CLICKABLE}` : 'cursor-not-allowed border-border opacity-40'} ${role === r ? CARD_CHOSEN : ''}`}>
                <input type="radio" name="own-role" className="mt-1 accent-accent" disabled={!allowed} checked={role === r} onChange={() => setRole(r)} />
                <span>
                  <b className="block text-body font-medium text-text-primary">{ROLE_WORD[r]}</b>
                  <span className="block text-small text-text-muted">{ownRoleNote(r, person.teams)}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <p className="text-small text-text-secondary">They stay a direct member if {teams} leaves this project or they leave the team.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={busy || role === null}>Make direct member</Button>
        </div>
      </div>
    </Modal>
  )
}
