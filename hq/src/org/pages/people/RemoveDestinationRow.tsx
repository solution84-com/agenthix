import { useQuery, getProjectMembers } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import type { OpenTasksChoice } from './peopleFormat'

const WAIT = 'wait'

/** One project where tasks are done on the person's behalf: nothing is chosen until the admin picks. */
export function RemoveDestinationRow({ project, personId, personName, choice, onChoose }: {
  project: { id: string; key: string; name: string; openTaskCount: number }
  personId: string
  personName: string
  choice: OpenTasksChoice | undefined
  onChoose: (c: OpenTasksChoice | undefined) => void
}) {
  const { data: members } = useQuery(getProjectMembers, { projectId: project.id })
  const others = (members ?? []).filter(m => m.userId !== personId && m.person.state === 'active')
  const value = !choice ? '' : choice.kind === 'wait' ? WAIT : choice.userId

  function change(v: string) {
    onChoose(v === '' ? undefined : v === WAIT ? { kind: 'wait' } : { kind: 'person', userId: v })
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-text-primary">{project.name}</div>
        <div className="text-small text-text-muted">{project.openTaskCount} open {project.openTaskCount === 1 ? 'task' : 'tasks'} done on behalf of {personName}</div>
      </div>
      <NativeSelect size="sm" className="w-auto" aria-label={`Open tasks in ${project.name}`} value={value} onChange={e => change(e.target.value)}>
        <option value="">Choose…</option>
        {others.map(m => <option key={m.userId} value={m.userId}>Done on behalf of {m.person.name}</option>)}
        <option value={WAIT}>Leave them waiting</option>
      </NativeSelect>
    </li>
  )
}
