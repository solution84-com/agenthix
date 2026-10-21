import { useAction, updateProject } from 'wasp/client/operations'
import { NativeSelect } from '../../../shared/components/ui/NativeSelect'
import { Part, ReadOnlyValue } from './Part'
import { usePartSave } from './usePartSave'
import type { SettingsProject } from './types'

/** The agent a new conversation here starts with: one of the project's own agents, chosen by its admins. */
export function AgentsSection({ project, canEdit }: { project: SettingsProject; canEdit: boolean }) {
  const update = useAction(updateProject)
  const save = usePartSave()
  const here = project.agents.map(a => a.agent)
  const current = here.find(a => a.id === project.defaultAgentId)

  const hint = here.length === 0
    ? 'Assign an agent in the Agents tool first; the first one added becomes the default.'
    : 'New conversations in this project start with this agent.'
  return (
    <Part label="Default agent" htmlFor="set-default-agent" save={save} hint={hint}>
      {canEdit && here.length > 0 ? (
        <NativeSelect
          id="set-default-agent"
          value={current?.id ?? ''}
          disabled={save.state === 'saving'}
          onChange={e => void save.save(() => update({ projectId: project.id, defaultAgentId: e.target.value || null }))}
        >
          <option value="">None</option>
          {here.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      ) : (
        <ReadOnlyValue id="set-default-agent">{current?.name ?? 'None'}</ReadOnlyValue>
      )}
    </Part>
  )
}
