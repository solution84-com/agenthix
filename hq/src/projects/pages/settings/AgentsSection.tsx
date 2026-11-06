import { Link } from 'react-router'
import { useAction, updateProject } from 'wasp/client/operations'
import { NativeSelect } from '../../../shared/components/ui/NativeSelect'
import { Part, ReadOnlyValue } from './Part'
import { usePartSave } from './usePartSave'
import type { SettingsProject } from './types'

/**
 * The agent a new conversation here starts with: one of the project's own agents, chosen by its admins. With none
 * assigned the choice is greyed and the hint leads to where one is assigned. Where the project runs was chosen when it was made.
 */
export function AgentsSection({ project, canEdit }: { project: SettingsProject; canEdit: boolean }) {
  const update = useAction(updateProject)
  const save = usePartSave()
  const here = project.agents.map(a => a.agent)
  const current = here.find(a => a.id === project.defaultAgentId)
  const none = here.length === 0

  const hint = none
    ? <>Assign an agent in <Link to={`/projects/${project.key}?tool=members`} className="text-accent hover:underline">Members › Assign an agent</Link>; the first one added becomes the default.</>
    : 'The agent new conversations here start with.'
  return (
    <div className="space-y-4">
      <Part label="Default agent" htmlFor="set-default-agent" save={save} hint={hint}>
        {canEdit ? (
          <NativeSelect
            id="set-default-agent"
            value={current?.id ?? ''}
            disabled={none || save.state === 'saving'}
            title={none ? 'Assign an agent in Members first' : undefined}
            onChange={e => void save.save(() => update({ projectId: project.id, defaultAgentId: e.target.value || null }))}
          >
            {none ? <option value="">Assign an agent in Members first</option> : <option value="">None</option>}
            {here.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        ) : (
          <ReadOnlyValue id="set-default-agent">{current?.name ?? 'None'}</ReadOnlyValue>
        )}
      </Part>
      <Part label="Where it runs" htmlFor="set-site" hint="Its files are kept there, and its agents run there.">
        <ReadOnlyValue id="set-site"><span title="Set when the project was made">{project.executionSite?.label ?? 'None'} <span className="text-text-muted">· set when the project was made</span></span></ReadOnlyValue>
      </Part>
    </div>
  )
}
