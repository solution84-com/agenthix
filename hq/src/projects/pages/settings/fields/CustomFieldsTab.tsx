import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  useAction, useQuery, archiveCustomField, createCustomField, deleteCustomField, getCustomFields, getTaskTemplateSource,
  renameCustomField, reorderCustomFields,
} from 'wasp/client/operations'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button, EmptyState, FOCUS_RING } from '@agenthix/ui/primitives'
import type { CustomFieldView } from '@agenthix/core'
import { MoreMenu, type MenuItem } from '../../../../org/components/menus'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { useMayWork } from '../../../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../../../shared/layouts/phoneActions'
import { refusalText } from '../../../../shared/refusal'
import type { SettingsProject } from '../types'
import { publishTemplatePath } from '../types/typePaths'
import { DeleteFieldDialog, NameDialog, NewFieldDialog } from './FieldDialogs'
import { FieldOptions, OptionSwatch } from './FieldOptions'
import { CUSTOM_FIELD_NAME_MAX_LENGTH, VIEWER_CANNOT_CHANGE_FIELDS, movedOne, newFieldWhy } from './fieldRules'

const PUBLISH_HINT = "This project's types and fields, to the Library"
const PROPOSE_HINT = "This project's types and fields, for a maintainer to publish"

type Dialog = { kind: 'new' } | { kind: 'rename'; field: CustomFieldView } | { kind: 'delete'; field: CustomFieldView } | null

function useFields(projectId: string) {
  const { data, refetch } = useQuery(getCustomFields, { projectId, includeArchived: true })
  const fields = (data ?? null) as CustomFieldView[] | null
  // Archived ones last, dimmed: their values are kept, and they can be brought back.
  return { fields: fields && [...fields.filter(f => !f.archivedAt), ...fields.filter(f => f.archivedAt)], refetch }
}

/** The page's actions on Custom fields: New field, the one filled button, and ⋯ with Publish (or Propose) as task template. */
export function CustomFieldsActions({ project, onNew }: { project: SettingsProject; onNew: () => void }) {
  const navigate = useNavigate()
  const mayChange = useMayWork(project.id)
  const { fields } = useFields(project.id)
  const { data: source } = useQuery(getTaskTemplateSource, { projectId: project.id }, { enabled: mayChange })
  const publishes = source?.mayPublish ?? false
  const viewer = mayChange ? undefined : VIEWER_CANNOT_CHANGE_FIELDS
  const why = newFieldWhy(fields?.length ?? 0, mayChange) ?? undefined
  const share = { label: publishes ? 'Publish as task template…' : 'Propose as task template…', hint: publishes ? PUBLISH_HINT : PROPOSE_HINT }
  const onPhone = usePhoneActions([
    { label: 'New field', onSelect: onNew, disabledWhy: why },
    { ...share, onSelect: () => navigate(publishTemplatePath(project.key)), disabledWhy: viewer },
  ])
  const more: MenuItem[] = [{ ...share, disabled: !mayChange, title: viewer, onSelect: () => navigate(publishTemplatePath(project.key)) }]
  return (
    <div className={`flex shrink-0 items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>
      <Button leadingIcon={<Plus size={16} aria-hidden />} disabled={!!why} title={why} onClick={onNew}>New field</Button>
      <MoreMenu items={more} label="More on custom fields" />
    </div>
  )
}

/**
 * Settings › Custom fields (spec D4, D16): the project's single-select fields in their order, each with its options and
 * their colours; open one to change its options. A field is an extra view and never sets a task's state. Archiving
 * keeps its values; deleting takes them. A Viewer reads it with every change greyed, saying why. Fields are also made
 * from a board's Columns menu.
 */
export function CustomFieldsTab({ project, newOpen, onNewClose }: { project: SettingsProject; newOpen: boolean; onNewClose: () => void }) {
  const mayChange = useMayWork(project.id)
  const { fields, refetch } = useFields(project.id)
  const create = useAction(createCustomField)
  const rename = useAction(renameCustomField)
  const reorder = useAction(reorderCustomFields)
  const archive = useAction(archiveCustomField)
  const remove = useAction(deleteCustomField)
  const attention = useAttention()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [open, setOpen] = useState<string | null>(null)

  const run = (title: string, work: () => Promise<unknown>) => {
    work().then(() => void refetch(), err => attention.show({ title, text: refusalText(err), retry: () => run(title, work) }))
  }
  if (!fields) return <p className="text-small text-text-muted">Loading…</p>

  const ids = fields.map(f => f.id)
  const why = mayChange ? undefined : VIEWER_CANNOT_CHANGE_FIELDS
  const order = (next: string[] | null) => { if (next) run('The fields were not reordered', () => reorder({ projectId: project.id, fieldIds: next })) }
  const menuOf = (f: CustomFieldView): MenuItem[] => [
    { label: 'Rename…', disabled: !mayChange, title: why, onSelect: () => setDialog({ kind: 'rename', field: f }) },
    { label: 'Move up', disabled: !mayChange || !movedOne(ids, f.id, -1), title: why, onSelect: () => order(movedOne(ids, f.id, -1)) },
    { label: 'Move down', disabled: !mayChange || !movedOne(ids, f.id, 1), title: why, onSelect: () => order(movedOne(ids, f.id, 1)) },
    f.archivedAt
      ? { label: 'Bring back', hint: 'Its values and boards show again', separatorBefore: true, disabled: !mayChange, title: why, onSelect: () => run(`${f.name} was not brought back`, () => archive({ fieldId: f.id, archived: false })) }
      : { label: 'Archive', hint: 'Hidden, with every value kept', separatorBefore: true, disabled: !mayChange, title: why, onSelect: () => run(`${f.name} was not archived`, () => archive({ fieldId: f.id })) },
    { label: 'Delete…', danger: true, disabled: !mayChange, title: why, onSelect: () => setDialog({ kind: 'delete', field: f }) },
  ]
  const others = (f?: CustomFieldView) => fields.filter(x => x.id !== f?.id).map(x => x.name)

  return (
    <div className="max-w-3xl space-y-3">
      {!mayChange && <p className="text-small text-text-muted">{VIEWER_CANNOT_CHANGE_FIELDS}</p>}
      {fields.length === 0 ? (
        <EmptyState variant="inline" title="No custom fields yet" hint="A field is a single choice from a list, such as Launch stage. A board can show its options as columns; it never changes a task's state." />
      ) : (
        <>
          <p className="text-small text-text-muted">{fields.length} {fields.length === 1 ? 'field' : 'fields'} · single select · in Details on every task, in this order</p>
          <ul aria-label="Custom fields" className="space-y-2">
            {fields.map(f => {
              const expanded = open === f.id
              return (
                <li key={f.id} className={`rounded-xl border border-border bg-card ${f.archivedAt ? 'opacity-40' : ''}`}>
                  <div className="flex min-h-14 items-center gap-2 py-2 pl-2 pr-2">
                    <button
                      type="button" aria-expanded={expanded} aria-controls={`field-${f.id}`} onClick={() => setOpen(expanded ? null : f.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-hover ${FOCUS_RING}`}
                    >
                      {expanded ? <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" /> : <ChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-text-primary">{f.name}</span>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-micro text-text-muted">
                          {f.archivedAt && <span>Archived</span>}
                          {f.options.length === 0 ? <span>No options yet</span> : f.options.map(o => (
                            <span key={o.id} className="inline-flex items-center gap-1 text-text-secondary"><OptionSwatch colour={o.colour} />{o.name}</span>
                          ))}
                        </span>
                      </span>
                    </button>
                    <MoreMenu items={menuOf(f)} label={`${f.name}: more`} />
                  </div>
                  {expanded && (
                    <div id={`field-${f.id}`} className="border-t border-border-subtle p-3">
                      <FieldOptions field={f} mayChange={mayChange} run={run} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {newOpen && (
        <NewFieldDialog taken={others()} onCancel={onNewClose}
          onCreate={(name, options) => { onNewClose(); run('The field was not added', () => create({ projectId: project.id, name, options: options.map(o => ({ name: o })) }).then(f => setOpen((f as CustomFieldView).id))) }} />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog title={`Rename ${dialog.field.name}`} initial={dialog.field.name} confirm="Rename" max={CUSTOM_FIELD_NAME_MAX_LENGTH} taken={others(dialog.field)} what="field"
          onCancel={() => setDialog(null)} onConfirm={name => { setDialog(null); run(`${dialog.field.name} was not renamed`, () => rename({ fieldId: dialog.field.id, name })) }} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteFieldDialog field={dialog.field} onCancel={() => setDialog(null)}
          onDelete={() => { setDialog(null); run(`${dialog.field.name} was not deleted`, () => remove({ fieldId: dialog.field.id })) }} />
      )}
      {attention.dialog}
    </div>
  )
}
