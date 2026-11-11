import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAction, useQuery, archiveTaskType, deleteTaskType, getTaskTemplateSource, getTaskTypeUse, getTaskTypes } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import type { TaskTypeView } from '@agenthix/core'
import { Plus } from 'lucide-react'
import { MoreMenu, type MenuItem } from '../../../../org/components/menus'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { useMayWork } from '../../../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../../../shared/layouts/phoneActions'
import { refusalText } from '../../../../shared/refusal'
import type { TaskTypeUse } from '../../../taskTypeUse'
import { StateColumnCells, StateColumnLines } from '../../../components/TypeStateColumns'
import type { SettingsProject } from '../types'
import { VIEWER_CANNOT_CHANGE_TYPES, typeMenu, typeSubline, type TypeMenuItem } from './typeRules'
import { newTaskTypePath, publishTemplatePath, taskTypePath } from './typePaths'

const ROW = 'grid grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_56px_36px] items-center gap-x-4 border-b border-border-subtle px-2'
const PUBLISH_HINT = "This project's types and fields, to the Library"
const PROPOSE_HINT = "This project's types and fields, for a maintainer to publish"

/** The page's actions on Task types: New task type, the one filled button, and ⋯ with Publish (or Propose) as task template. */
export function TaskTypesActions({ project }: { project: SettingsProject }) {
  const navigate = useNavigate()
  const mayChange = useMayWork(project.id)
  const { data: source } = useQuery(getTaskTemplateSource, { projectId: project.id }, { enabled: mayChange })
  const publishes = source?.mayPublish ?? false
  const why = mayChange ? undefined : VIEWER_CANNOT_CHANGE_TYPES
  const share = { label: publishes ? 'Publish as task template…' : 'Propose as task template…', hint: publishes ? PUBLISH_HINT : PROPOSE_HINT }
  const onPhone = usePhoneActions([
    { label: 'New task type', onSelect: () => navigate(newTaskTypePath(project.key)), disabledWhy: why },
    { ...share, onSelect: () => navigate(publishTemplatePath(project.key)), disabledWhy: why },
  ])
  const more: MenuItem[] = [{ ...share, disabled: !mayChange, title: why, onSelect: () => navigate(publishTemplatePath(project.key)) }]
  return (
    <div className={`flex shrink-0 items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>
      <Button leadingIcon={<Plus size={16} aria-hidden />} disabled={!mayChange} title={why} onClick={() => navigate(newTaskTypePath(project.key))}>New task type</Button>
      <MoreMenu items={more} label="More on task types" />
    </div>
  )
}

function useTypeActions(onDone: () => void) {
  const archive = useAction(archiveTaskType)
  const remove = useAction(deleteTaskType)
  const attention = useAttention()
  const run = (title: string, work: () => Promise<unknown>) => {
    work().then(onDone, err => attention.show({ title, text: refusalText(err), retry: () => run(title, work) }))
  }
  return {
    dialog: attention.dialog,
    archive: (t: TaskTypeView) => run(`${t.name} was not archived`, () => archive({ typeId: t.id })),
    restore: (t: TaskTypeView) => run(`${t.name} was not brought back`, () => archive({ typeId: t.id, archived: false })),
    remove: (t: TaskTypeView) => run(`${t.name} was not deleted`, () => remove({ typeId: t.id })),
  }
}

function menuOf(items: TypeMenuItem[], pick: (item: TypeMenuItem) => void): MenuItem[] {
  return items.map((i, n) => ({
    label: i.label, hint: i.hint, danger: i.danger, disabled: !!i.disabledWhy, title: i.disabledWhy,
    separatorBefore: n === 1, onSelect: () => pick(i),
  }))
}

/**
 * Settings › Task types (spec D10, D12, D16): every type, each row read across the four task states, which of the
 * type's columns sits in each, then its tasks and its ⋯. A Viewer reads it with every change greyed, saying why.
 */
export function TaskTypesTab({ project }: { project: SettingsProject }) {
  const navigate = useNavigate()
  const mayChange = useMayWork(project.id)
  const typesQuery = useQuery(getTaskTypes, { projectId: project.id, includeArchived: true })
  const { data: types, refetch } = typesQuery
  const read = useBackgroundRead(typesQuery, { what: 'The task types' })
  const { data: use, refetch: refetchUse } = useQuery(getTaskTypeUse, { projectId: project.id })
  const [deleting, setDeleting] = useState<TaskTypeView | null>(null)
  const act = useTypeActions(() => { void refetch(); void refetchUse() })

  if (!types) return read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>
  const useOf = (id: string): TaskTypeUse | undefined => (use as TaskTypeUse[] | undefined)?.find(u => u.typeId === id)
  const pick = (t: TaskTypeView) => (i: TypeMenuItem) => {
    if (i.action === 'edit') navigate(taskTypePath(project.key, t.id))
    else if (i.action === 'archive') act.archive(t)
    else if (i.action === 'restore') act.restore(t)
    else setDeleting(t)
  }
  const shown = [...types.filter(t => !t.archivedAt), ...types.filter(t => t.archivedAt)]

  return (
    <div className="space-y-2">
      {!mayChange && <p className="text-small text-text-muted">{VIEWER_CANNOT_CHANGE_TYPES}</p>}
      <p className="text-small text-text-muted">
        {shown.length} {shown.length === 1 ? 'type' : 'types'} · each row reads across the four task states: which of the type's columns sits in each.
      </p>
      <div className="max-md:hidden" role="table" aria-label="Task types">
        <div role="row" className={`${ROW} pb-2 pt-3 text-micro font-medium text-text-muted`}>
          <span role="columnheader">Type</span>
          <span role="columnheader">Backlog</span><span role="columnheader">To do</span>
          <span role="columnheader">In progress</span><span role="columnheader">Done</span>
          <span role="columnheader" className="text-right">Tasks</span><span />
        </div>
        {shown.map(t => (
          <div key={t.id} role="row" className={`${ROW} py-2.5 ${t.archivedAt ? 'opacity-40' : ''}`}>
            <div className="flex min-w-0 items-center gap-2.5">
              <TaskTypeMark type={t} variant="tile" />
              <div className="min-w-0">
                <div className="truncate text-body font-medium text-text-primary">{t.name}</div>
                <div className="truncate text-micro text-text-muted">{typeSubline(t, useOf(t.id))}</div>
              </div>
            </div>
            <StateColumnCells columns={t.columns} />
            <span className="text-right text-small text-text-secondary">{useOf(t.id)?.tasks ?? ''}</span>
            <MoreMenu items={menuOf(typeMenu(t, useOf(t.id), mayChange), pick(t))} label={`${t.name}: more`} />
          </div>
        ))}
      </div>
      <ul className="space-y-3 md:hidden" aria-label="Task types">
        {shown.map(t => (
          <li key={t.id} className={`space-y-3 rounded-xl border border-border bg-card p-3 ${t.archivedAt ? 'opacity-40' : ''}`}>
            <div className="flex items-start gap-2.5">
              <TaskTypeMark type={t} variant="tile" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium text-text-primary">{t.name}</div>
                <div className="text-micro text-text-muted">{typeSubline(t, useOf(t.id), true)}</div>
              </div>
              <MoreMenu items={menuOf(typeMenu(t, useOf(t.id), mayChange), pick(t))} label={`${t.name}: more`} />
            </div>
            <StateColumnLines columns={t.columns} />
          </li>
        ))}
      </ul>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={deleting ? `Delete the type ${deleting.name}?` : undefined}>
        <p className="text-body text-text-secondary">
          No task has ever used it, so nothing else changes. Its columns go with it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { if (deleting) act.remove(deleting); setDeleting(null) }}>Delete type</Button>
        </div>
      </Modal>
      {act.dialog}
    </div>
  )
}
