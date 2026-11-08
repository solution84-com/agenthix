import { useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getTaskTemplateSource, proposeTaskTemplate, publishTaskTemplate } from 'wasp/client/operations'
import { CONTROL_HEIGHT, MarkdownBox } from '@agenthix/ui/primitives'
import { TaskTypeMark } from '@agenthix/ui/tasks'
import type { TaskTypeView } from '@agenthix/core'
import { useProjectPlace } from '../../../place/useProjectPlace'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { MarkdownMessage } from '../../../../shared/components/MarkdownMessage'
import { refusalText } from '../../../../shared/refusal'
import { slugOf } from '../../../../assets/publisherNames'
import { libraryAssetPath, libraryTaskTemplateProposalPath } from '../../../../library/components/libraryRoutes'
import type { FieldToShare } from '../../../../library/taskTemplates/templateOperations'
import { StateColumnsInline } from '../../../components/TypeStateColumns'
import { OptionChips } from '../../../../library/components/TaskTemplateHolds'
import { INPUT } from '../Part'
import { settingsTabHref } from '../SettingsTabs'
import { SettingsFormFrame } from './SettingsFormFrame'
import { holdsWords, identityWords } from './publishWords'
import { BUILT_IN_KEPT, tasksWords } from './typeRules'

const BOX = 'h-4 w-4 shrink-0 accent-accent disabled:opacity-40'

function TypeRow({ type, tasks, on, onToggle }: { type: TaskTypeView; tasks: number; on: boolean; onToggle: () => void }) {
  const builtIn = type.kind !== 'CUSTOM'
  return (
    <label className={`flex items-start gap-3 border-b border-border-subtle px-2 py-2.5 ${builtIn ? 'opacity-60' : 'cursor-pointer'}`} title={builtIn ? `${BUILT_IN_KEPT}, so they are not shared` : undefined}>
      <input type="checkbox" className={`${BOX} mt-1`} checked={on} disabled={builtIn} onChange={onToggle} aria-label={type.name} />
      <TaskTypeMark type={type} variant="tile" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-body font-semibold text-text-primary">{type.name}</span>
        <span className="block text-micro text-text-muted">{builtIn ? 'Built in' : `${tasksWords(tasks)} here`}</span>
        <StateColumnsInline columns={type.columns} />
      </span>
    </label>
  )
}

function FieldRow({ field, on, onToggle }: { field: FieldToShare; on: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-b border-border-subtle px-2 py-2.5">
      <input type="checkbox" className={`${BOX} mt-1`} checked={on} onChange={onToggle} aria-label={field.name} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-body font-semibold text-text-primary">{field.name}</span>
        <span className="block text-micro text-text-muted">Single select · {field.options.length} {field.options.length === 1 ? 'option' : 'options'}</span>
        <OptionChips options={field.options} />
      </span>
    </label>
  )
}

const toggle = (set: Set<string>, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next }

/**
 * Publish (or Propose) as task template, at `/projects/:key/settings/types/publish` (spec D16, TM2): a name, a
 * description in the one Markdown editor, and a tick for each type and field to include. Administrators and Library
 * maintainers publish version 1.0.0 to the organisation's Library and land on its page; anyone else sends it for a
 * maintainer to review. Task and Epic are in every project, so they are never shared.
 */
export function PublishTaskTemplatePage() {
  const { key = '' } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const nameId = useId()
  const { project, place } = useProjectPlace(key)
  const projectId = project?.id
  const { data: source } = useQuery(getTaskTemplateSource, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const publish = useAction(publishTaskTemplate)
  const propose = useAction(proposeTaskTemplate)
  const attention = useAttention()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [fields, setFields] = useState<Set<string>>(new Set())

  const publishes = source?.mayPublish ?? false
  const back = () => navigate(settingsTabHref(key, 'types'))
  const sharable = (source?.types ?? []).filter(t => t.kind === 'CUSTOM')
  const why = !source ? 'Loading…' : types.size + fields.size === 0 ? `Tick a type or a field to ${publishes ? 'publish' : 'send'}` : !slugOf(name) ? 'Give the template a name' : undefined
  const send = () => {
    if (!projectId || why) return
    const input = { projectId, name, description, typeIds: [...types], fieldIds: [...fields] }
    const done = publishes
      ? publish(input).then(out => navigate(libraryAssetPath(out.assetId)))
      : propose(input).then(out => navigate(libraryTaskTemplateProposalPath(out.proposalId)))
    done.catch(err => attention.show({ title: publishes ? 'It was not published' : 'It was not sent for review', text: refusalText(err), retry: send }))
  }
  const title = publishes ? 'Publish as task template' : 'Propose as task template'
  const under = `${project?.name ?? 'This project'}'s task types and custom fields, ${publishes ? 'published' : 'proposed'} to your organisation's Library.`
  const tasksOf = (id: string) => source?.use.find(u => u.typeId === id)?.tasks ?? 0

  return (
    <SettingsFormFrame
      projectKey={key} place={place} projectName={project?.name} title={title} under={under}
      onCancel={back} submit={{ label: publishes ? 'Publish' : 'Send for review', onClick: send, disabled: !!why, why }}
    >
      {!source ? <p className="text-small text-text-muted">Loading…</p> : (
        <div className="max-w-3xl space-y-5">
          <div className="max-w-[420px]">
            <label htmlFor={nameId} className="mb-1.5 block text-small text-text-secondary">Name</label>
            <input id={nameId} value={name} maxLength={64} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
            <p className="mt-1.5 text-micro text-text-muted">{identityWords(source.publisher, slugOf(name), publishes)}</p>
          </div>
          <div>
            <p className="mb-1.5 text-small text-text-secondary">Description</p>
            <MarkdownBox label="Description" value={description} onChange={setDescription} placeholder="What it is for, in a line or two." renderPreview={text => <MarkdownMessage content={text} />} />
          </div>
          <section aria-label="Task types" className="border-t border-border-subtle pt-4">
            <h2 className="text-small font-semibold text-text-primary">Task types · {types.size} of {source.types.length} ticked</h2>
            {source.types.map(t => <TypeRow key={t.id} type={t} tasks={tasksOf(t.id)} on={types.has(t.id)} onToggle={() => setTypes(s => toggle(s, t.id))} />)}
            <p className="mt-1.5 text-micro text-text-muted">{BUILT_IN_KEPT}, so they are not shared.{sharable.length === 0 ? ' This project has no type of its own yet.' : ''}</p>
          </section>
          <section aria-label="Custom fields" className="border-t border-border-subtle pt-4">
            <h2 className="text-small font-semibold text-text-primary">Custom fields · {fields.size} of {source.fields.length} ticked</h2>
            {source.fields.length === 0
              ? <p className="mt-1.5 text-small text-text-muted">This project has no custom fields.</p>
              : source.fields.map(f => <FieldRow key={f.id} field={f} on={fields.has(f.id)} onToggle={() => setFields(s => toggle(s, f.id))} />)}
          </section>
          <div className="space-y-1 border-t border-border-subtle pt-4 text-small text-text-secondary">
            <p className="font-medium text-text-primary">{holdsWords(types.size, fields.size)}</p>
            <p>
              {publishes
                ? 'A project that adds it gets its own copy: what it adds is that project\'s own, and later versions don\'t change it. This project\'s types and fields stay as they are, and don\'t follow the template either.'
                : 'A Library maintainer reviews it and publishes it. A project that adds it gets its own copy, and later versions don\'t change it.'}
            </p>
            <p className="text-micro text-text-muted">{publishes ? 'Publishing is for administrators and Library maintainers; anyone else proposes instead.' : 'Nothing reaches the Library until a maintainer publishes it.'}</p>
          </div>
        </div>
      )}
      {attention.dialog}
    </SettingsFormFrame>
  )
}
