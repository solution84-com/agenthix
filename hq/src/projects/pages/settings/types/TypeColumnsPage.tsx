import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getTaskTypeUse, getTaskTypes, updateTaskType } from 'wasp/client/operations'
import { useProjectPlace } from '../../../place/useProjectPlace'
import { useMayWork } from '../../../../shared/hooks/useMayWork'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { refusalText } from '../../../../shared/refusal'
import type { TaskTypeUse } from '../../../taskTypeUse'
import { settingsTabHref } from '../SettingsTabs'
import { SettingsFormFrame } from './SettingsFormFrame'
import { TypeNameField } from './TypeNameField'
import { ColumnLanes } from './ColumnLanes'
import { VIEWER_CANNOT_CHANGE_TYPES, typeSubline, tasksWords } from './typeRules'

/**
 * A task type's columns, at `/projects/:key/settings/types/:typeId` (spec D10): its name and mark, saved with Save, and
 * its columns inside the four task states, each change made as it happens. Task and Epic can be renamed too; they stay
 * Task and Epic underneath.
 */
export function TypeColumnsPage() {
  const { key = '', typeId = '' } = useParams<{ key: string; typeId: string }>()
  const navigate = useNavigate()
  const { project, place } = useProjectPlace(key)
  const projectId = project?.id
  const mayChange = useMayWork(projectId)
  const { data: types, refetch } = useQuery(getTaskTypes, projectId ? { projectId, includeArchived: true } : undefined, { enabled: !!projectId })
  const { data: uses, refetch: refetchUse } = useQuery(getTaskTypeUse, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const save = useAction(updateTaskType)
  const attention = useAttention()
  const type = types?.find(t => t.id === typeId)
  const use = (uses as TaskTypeUse[] | undefined)?.find(u => u.typeId === typeId)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('task')
  useEffect(() => { if (type) { setName(type.name); setIcon(type.icon) } }, [type?.id, type?.name, type?.icon])

  const back = () => navigate(settingsTabHref(key, 'types'))
  const changed = !!type && (name.trim() !== type.name || icon !== type.icon)
  const why = !mayChange ? VIEWER_CANNOT_CHANGE_TYPES : name.trim() === '' ? 'Give the type a name' : !changed ? 'Nothing has changed' : undefined
  const onSave = () => {
    if (!type || why) return
    save({ typeId: type.id, name: name.trim(), icon }).then(back, err => attention.show({ title: `${type.name} was not saved`, text: refusalText(err), retry: onSave }))
  }
  const under = type ? [typeSubline(type, use), tasksWords(use?.tasks ?? 0)].join(' · ') : undefined

  return (
    <SettingsFormFrame
      projectKey={key} place={place} projectName={project?.name} title={type?.name ?? 'Task type'} under={under}
      onCancel={back} submit={{ label: 'Save', onClick: onSave, disabled: !!why, why }}
    >
      {!types ? <p className="text-small text-text-muted">Loading…</p> : !type ? (
        <p role="alert" className="text-body text-text-secondary">This project has no such task type. It may have been deleted.</p>
      ) : (
        <div className="space-y-4">
          <TypeNameField name={name} icon={icon} onName={setName} onIcon={setIcon} disabled={!mayChange} />
          <div className="border-t border-border-subtle pt-4">
            <p className="mb-3 text-small text-text-secondary"><span className="max-lg:hidden">Columns, left to right as on its board</span><span className="lg:hidden">Columns, in board order</span></p>
            <ColumnLanes type={type} held={use?.columns ?? {}} projectKey={key} mayChange={mayChange} onChanged={() => { void refetch(); void refetchUse() }} />
          </div>
        </div>
      )}
      {attention.dialog}
    </SettingsFormFrame>
  )
}
