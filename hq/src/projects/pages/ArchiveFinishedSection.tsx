import { useEffect, useState } from 'react'
import {
  useQuery, useAction, getOrgArchiveSetting, updateOrgArchiveSetting, getProjectArchiveSetting, setProjectArchiveSetting,
} from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { NativeSelect } from '../../shared/components/ui/NativeSelect'
import { CARD, CardHeading, useCredentialCall } from '../../model-access/pages/modelAccessParts'
import { Part, ReadOnlyValue } from './settings/Part'
import { usePartSave } from './settings/usePartSave'
import { ShowAttention } from '@agenthix/ui/attention'

type Scope = { kind: 'org' } | { kind: 'project'; projectId: string }

const CHOICES: { value: number; label: string }[] = [
  { value: 0, label: 'Never (off)' },
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
]
const label = (days: number) => CHOICES.find(c => c.value === days)?.label ?? `${days} days`
/** The project's select value for "use the organisation's". */
const INHERIT = 'org'

const PROJECT_HINT = 'A task that has sat in a done column with no run pending for this long is archived: off the board, still searchable. You can still archive one by hand.'

/** The project's own choice, saved as it is made; read as text by those who may not change it. */
function ProjectArchive({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, refetch } = useQuery(getProjectArchiveSetting, { projectId })
  const saveProject = useAction(setProjectArchiveSetting)
  const save = usePartSave()
  if (!data) return <p className="text-small text-text-muted">Loading…</p>

  const current = data.own === null ? INHERIT : String(data.own)
  const inherited = `Organisation's default (${label(data.org)})`
  const id = 'archive-project'
  if (!canEdit) {
    return (
      <Part label="Archive finished tasks after" htmlFor={id} hint={PROJECT_HINT}>
        <ReadOnlyValue id={id}>{data.own === null ? inherited : label(data.own)}</ReadOnlyValue>
      </Part>
    )
  }
  return (
    <Part label="Archive finished tasks after" htmlFor={id} save={save} hint={PROJECT_HINT}>
      <div className="w-56">
        <NativeSelect
          id={id} value={current} disabled={save.state === 'saving'}
          onChange={e => void save.save(async () => {
            const value = e.target.value
            await saveProject({ projectId, days: value === INHERIT ? null : (Number(value) as 0 | 1 | 7 | 30) })
            await refetch()
          })}
        >
          <option value={INHERIT}>{inherited}</option>
          {CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </NativeSelect>
      </div>
    </Part>
  )
}

/**
 * Archive finished tasks after (spec §3). The org's value is the default every
 * project starts with; a project, or a person for their personal project,
 * chooses freely whatever the org's is.
 */
export function ArchiveFinishedSection({ scope, canEdit = true }: { scope: Scope; canEdit?: boolean }) {
  return scope.kind === 'project' ? <ProjectArchive projectId={scope.projectId} canEdit={canEdit} /> : <OrgArchive />
}

function OrgArchive() {
  const { data } = useQuery(getOrgArchiveSetting)
  const saveOrg = useAction(updateOrgArchiveSetting)
  const { busy, problem, run } = useCredentialCall()
  const [value, setValue] = useState('')

  useEffect(() => { if (data) setValue(String(data.days)) }, [data])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(() => saveOrg({ days: Number(value) as 0 | 1 | 7 | 30 }))
    if (ok) {
    }
  }

  return (
    <div className={CARD}>
      <CardHeading title="Archive finished tasks">
        The default every project starts with. A task that has sat in a done column with no run pending for this long is archived: off the board, still searchable. A project can choose differently.
      </CardHeading>
      {!data ? (
        <p className="text-text-muted text-body">Loading…</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="w-56">
            <label htmlFor="archive-org" className="block text-text-muted text-small mb-1">
              Archive after
            </label>
            <NativeSelect id="archive-org" value={value} onChange={e => setValue(e.target.value)}>
              {CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <ShowAttention text={problem} title="The setting was not saved" />
          </div>
        </form>
      )}
    </div>
  )
}
