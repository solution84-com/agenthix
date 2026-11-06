import { useState } from 'react'
import { useAction, addTeamToProject } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import type { ProjectRole } from '../../memberList'
import type { TeamSummary } from '../../../org/teams/teamQueries'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { avatarOf } from '../../agents/avatarOf'
import type { Attention } from '../../../shared/components/AttentionDialog'
import { reasonOf } from '../people/peopleErrors'
import { useProjectPeopleView } from '../people/useProjectPeopleView'
import { ROLE_ALLOWS, ROLE_ORDER, ROLE_WORD, joinsAs } from './memberWords'

/**
 * Adding one team: the role its people get, each choice saying what it allows; everyone who joins, person by person,
 * with the role they will have (the higher of the team's and their own, adr-0103) and agents Assigned, since agents
 * get no role (adr-0062); then what happens when the team changes. Nothing is done until Add names the team.
 */
export function AddTeamStep({ projectId, team, onBack, onDone, onProblem }: {
  projectId: string
  team: TeamSummary
  onBack: () => void
  onDone: () => void
  onProblem: (attention: Attention) => void
}) {
  const add = useAction(addTeamToProject)
  const { view, refetch } = useProjectPeopleView(projectId)
  const [role, setRole] = useState<ProjectRole>('MEMBER')
  const [busy, setBusy] = useState(false)
  const roleNow = new Map((view?.people ?? []).map(r => [r.person.userId, r.role as ProjectRole]))
  const count = team.people.length + team.agents.length

  const confirm = async () => {
    setBusy(true)
    try {
      await add({ projectId, teamId: team.id, role })
      await refetch()
      onDone()
    } catch (err) {
      onProblem({ text: reasonOf(err, `${team.name} could not be added. Nothing was changed.`), retry: () => void confirm() })
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="add-team-step">
      <fieldset className="space-y-1.5">
        <legend className="pb-1 text-small font-medium text-text-primary">The people in {team.name} join as</legend>
        {ROLE_ORDER.map(r => (
          <label key={r} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${role === r ? 'border-accent bg-accent-subtle' : 'border-border-subtle hover:bg-surface-hover'}`}>
            <input type="radio" name="team-role" className="mt-1" checked={role === r} onChange={() => setRole(r)} />
            <span>
              <b className="block text-body font-semibold text-text-primary">{ROLE_WORD[r]}</b>
              <span className="block text-small text-text-muted">{ROLE_ALLOWS[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <p className="pb-1 text-small font-medium text-text-primary">Who joins · {count}</p>
        {count === 0 ? <p className="text-small text-text-muted">No one is in {team.name} yet.</p> : (
          <ul className="max-h-[30vh] divide-y divide-border-subtle overflow-y-auto" aria-label="Who joins">
            {team.people.map(person => {
              const result = joinsAs(roleNow.get(person.userId) ?? null, role)
              return (
                <li key={person.userId} className="flex items-center gap-3 py-2">
                  <span className="shrink-0">{personAvatarOf(person, 'sm')}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-body font-medium text-text-primary">{person.name}</b>
                    {result.note && <span className="block truncate text-small text-text-muted">{result.note}</span>}
                  </span>
                  <span className="shrink-0 text-small text-text-primary">{ROLE_WORD[result.role]}</span>
                </li>
              )
            })}
            {team.agents.map(agent => (
              <li key={agent.id} className="flex items-center gap-3 py-2">
                <span className="shrink-0">{avatarOf(agent, 'sm')}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-body font-medium text-text-primary">{agent.name} <span className="text-small font-normal text-text-muted">✦ Agent</span></b>
                  <span className="block truncate text-small text-text-muted">Agents have no role; it works for whoever each task is for</span>
                </span>
                <span className="shrink-0 text-small text-text-primary">Assigned</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-small text-text-secondary">
        Whoever joins {team.name} later joins here as {ROLE_WORD[role]}; whoever leaves it leaves, unless they are here in their own right.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack} disabled={busy}>Back</Button>
        <Button onClick={() => void confirm()} disabled={busy}>Add {team.name}</Button>
      </div>
    </div>
  )
}
