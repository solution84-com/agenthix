import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getProjects, addProjectMember, setProjectMemberRole } from 'wasp/client/operations'
import { Button, NativeSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import { PROJECT_ROLE_CHOICES, firstName, projectRoleLabel, type ProjectRoleData } from '@agenthix/ui/people'
import type { OrgPersonView } from '../../../settings/orgPeopleQueries'
import { useAttentionWhen } from '@agenthix/ui/attention'

type ProjectChoice = { id: string; key: string; name: string; personalOwnerId: string | null }
type Role = ProjectRoleData

function ProjectRoleSelect({ projectId, userId, role, label }: { projectId: string; userId: string; role: Role; label: string }) {
  const setRole = useAction(setProjectMemberRole)
  return (
    <NativeSelect size="sm" aria-label={label} className="w-auto" value={role}
      onChange={e => { void setRole({ projectId, userId, role: e.target.value as Role }).catch(err => alert(err instanceof Error ? err.message : String(err))) }}>
      {PROJECT_ROLE_CHOICES.map(r => <option key={r} value={r}>{projectRoleLabel(r)}</option>)}
    </NativeSelect>
  )
}

function AddToProject({ person, options, onDone }: { person: OrgPersonView['person']; options: ProjectChoice[]; onDone: () => void }) {
  const add = useAction(addProjectMember)
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<Role>('MEMBER')
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error)

  async function submit() {
    setError(null)
    try { await add({ projectId, userId: person.userId, role }); setProjectId(''); onDone() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect size="sm" aria-label="Project to add" className="w-auto" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Add to a project…</option>
          {options.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
        </NativeSelect>
        <NativeSelect size="sm" aria-label="Add as" className="w-auto" value={role} onChange={e => setRole(e.target.value as Role)}>
          {PROJECT_ROLE_CHOICES.map(r => <option key={r} value={r}>as {projectRoleLabel(r)}</option>)}
        </NativeSelect>
        <Button size="sm" disabled={!projectId} onClick={() => void submit()}>Add</Button>
      </div>
      {errorDialog}
    </div>
  )
}

export function PersonProjects({ view }: { view: OrgPersonView }) {
  const { person, projects, privateProjectCount } = view
  const { data } = useQuery(getProjects)
  const [adding, setAdding] = useState(false)
  const active = person.state === 'active'
  const inIds = projects.map(p => p.id)
  const options = (data ?? []).filter(p => !p.personalOwnerId && !inIds.includes(p.id))
  const first = firstName(person.name)
  return (
    <section aria-label="Projects">
      <h2 className="flex items-baseline justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
        <span>Projects</span>
        {active && options.length > 0 && (
          <button type="button" onClick={() => setAdding(a => !a)} aria-expanded={adding} className={`rounded text-small font-normal normal-case tracking-normal text-link hover:underline ${FOCUS_RING}`}>
            Add to a project
          </button>
        )}
      </h2>
      {adding && <AddToProject person={person} options={options} onDone={() => setAdding(false)} />}
      {projects.length === 0 && <p className="mt-2 text-body text-text-muted">{active ? 'Not in any project you can see.' : 'In no project.'}</p>}
      <ul className="mt-1 divide-y divide-border-subtle">
        {projects.map(p => (
          <li key={p.id} className="flex items-center gap-x-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link to={`/projects/${p.key}`} className={`rounded block truncate text-body font-medium text-text-primary hover:underline ${FOCUS_RING}`}>{p.name}</Link>
              <div className="truncate text-small text-text-muted">
                {p.openTaskCount === 0 ? 'No open tasks' : `On ${first}'s behalf: ${p.openTaskCount} open`}
              </div>
            </div>
            {active && <ProjectRoleSelect projectId={p.id} userId={person.userId} role={p.role} label={`Role of ${person.name} in ${p.name}`} />}
          </li>
        ))}
      </ul>
      {privateProjectCount > 0 && (
        <p className="mt-2 text-small text-text-muted">
          and {privateProjectCount} private {privateProjectCount === 1 ? 'project' : 'projects'} you are not in
        </p>
      )}
    </section>
  )
}
