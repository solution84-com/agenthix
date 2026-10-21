import { useAction, useQuery, getProjectMembers, setProjectLead } from 'wasp/client/operations'
import { NativeSelect } from '../../shared/components/ui/NativeSelect'
import { Part, ReadOnlyValue } from './settings/Part'
import { usePartSave } from './settings/usePartSave'

type Person = { userId: string; username: string }

/**
 * The project's lead (spec §9): a member of the project, chosen by its admin.
 * Only members are offered, open project or private: membership is the only gate (adr-0099).
 */
export function ProjectLeadField({ projectId, lead, canEdit }: { projectId: string; lead: Person | null; canEdit: boolean }) {
  const { data: members } = useQuery(getProjectMembers, canEdit ? { projectId } : undefined)
  const setLead = useAction(setProjectLead)
  const save = usePartSave()
  const hint = "Shown in the project's facts. Being the lead gives no rights of its own."

  if (!canEdit) {
    return (
      <Part label="Lead" htmlFor="set-lead" hint={hint}>
        <ReadOnlyValue id="set-lead">{lead?.username ?? 'No lead'}</ReadOnlyValue>
      </Part>
    )
  }

  const people = (members ?? []) as Person[]
  // The current lead stays selectable while the list loads, or if they have left.
  const options = lead && !people.some(p => p.userId === lead.userId) ? [lead, ...people] : people

  return (
    <Part label="Lead" htmlFor="set-lead" save={save} hint={hint}>
      <NativeSelect
        id="set-lead"
        value={lead?.userId ?? ''}
        onChange={e => void save.save(() => setLead({ projectId, userId: e.target.value || null }), 'Could not change the lead')}
        disabled={save.state === 'saving'}
      >
        <option value="">No lead</option>
        {options.map(p => <option key={p.userId} value={p.userId}>{p.username}</option>)}
      </NativeSelect>
    </Part>
  )
}
