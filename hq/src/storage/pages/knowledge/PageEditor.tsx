import { useMemo, useState } from 'react'
import { checkPageChange } from '@agenthix/core'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY, FilesViewHeader } from '@agenthix/ui/projects'
import { ChangeLine } from './ChangeLine'
import { Field, PropertyRows, TagsInput, TextEditor, TextInput } from './EditorFields'
import {
  EMPTY_EDITOR, contentOf, editorFromContent, fieldProblems, groupByField, hasAny, offeredProperties, pageNameFor,
  type EditorState, type FieldProblems,
} from './editorModel'
import { readKnowledgePage, saveKnowledge } from './knowledgeData'
import { refusalWords } from './PageActions'
import { pageEmbed, pageFolder } from './pageEmbed'
import type { KnowledgeOwner, KnowledgePageRow, LastChange } from './knowledgeTypes'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../../shared/failureWords'

export type EditTarget =
  | { kind: 'new'; section: string }
  | { kind: 'edit'; page: string; content: string; version: string }

interface Conflict {
  current: { content: string; version: string }
  by?: LastChange
}

/** The editor (U3): the page as fields and Markdown text, saved through the same gate as an agent's change. */
export function PageEditor({ owner, target, pages, backLabel, onCancel, onSaved }: {
  owner: KnowledgeOwner
  target: EditTarget
  pages: KnowledgePageRow[]
  backLabel: string
  onCancel: () => void
  onSaved: (page: string) => void
}) {
  const isNew = target.kind === 'new'
  const offered = useMemo(() => offeredProperties(pages, isNew ? target.section.trim() : null), [pages, isNew, target])
  const [state, setState] = useState<EditorState>(() =>
    target.kind === 'edit'
      ? editorFromContent(target.page, target.content)
      : {
        ...EMPTY_EDITOR, section: target.section,
        properties: offeredProperties(pages, target.section).map(o => ({ name: o.name, value: '', list: false })),
      })
  const [problems, setProblems] = useState<FieldProblems>({})
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<EditorState>) => { setState(s => ({ ...s, ...patch })); setProblems({}) }

  const page = target.kind === 'edit' ? target.page : pageNameFor(state.section, state.title)
  const live = fieldProblems(state, page === '' ? null : page, isNew)
  const shown = hasAny(problems) ? problems : live

  const save = async (baseVersion: string | null) => {
    setError('')
    const fields = fieldProblems(state, page === '' ? null : page, isNew)
    if (page === '') fields.title = [...(fields.title ?? []), 'A page is named from its title: give it one.']
    const content = contentOf(state)
    const gate = page === '' ? [] : checkPageChange(page, content).problems
    const all: FieldProblems = { ...groupByField(gate) }
    for (const [k, v] of Object.entries(fields)) all[k as keyof FieldProblems] = [...new Set([...(all[k as keyof FieldProblems] ?? []), ...(v ?? [])])]
    if (hasAny(all)) { setProblems(all); return }
    setSaving(true)
    try {
      const result = await saveKnowledge({ owner, page, content, baseVersion })
      if (result.outcome === 'done') { onSaved(result.page); return }
      if (result.reason === 'conflict' && result.current) {
        setConflict({ current: result.current, by: await readKnowledgePage(owner, page).then(r => r.lastChange, () => undefined) })
      } else if (result.reason === 'problems' && result.problems?.length) setProblems(groupByField(result.problems))
      else setError(refusalWords(result))
    } catch (e) {
      setError(pressFailureWords(e, 'Nothing was changed.'))
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <>
      <button type="button" className={FILES_BUTTON} onClick={onCancel}>Cancel</button>
      <button type="button" className={FILES_BUTTON_PRIMARY} disabled={saving} onClick={() => void save(target.kind === 'edit' ? target.version : null)}>Save</button>
    </>
  )

  return (
    <>
      <FilesViewHeader back={backLabel} onBack={onCancel} title={isNew ? 'New page' : 'Edit page'} action={actions} />
      {conflict && (
        <ShowAttention kind="alert"
          title={isNew ? 'This name is taken' : 'Changed while you were editing'}
          text={<>
            <p>{conflict.by ? <>This page was saved <ChangeLine change={conflict.by} />. </> : 'Someone saved this page meanwhile. '}Your text is kept here.</p>
            <p className="mt-2 text-small text-text-secondary">Their version:</p>
            <pre aria-label="Their version" className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2 font-mono text-micro text-text-primary">{conflict.current.content}</pre>
          </>}
          actions={[{ label: 'Save mine over it', variant: 'primary', onClick: () => { const v = conflict.current.version; setConflict(null); void save(v) } }]} />
      )}
      {error && <ShowAttention kind="alert" text={error} />}
      <Field label="Title" htmlFor="knowledge-title" problems={shown.title}>
        <TextInput id="knowledge-title" value={state.title} onChange={title => set({ title })} />
      </Field>
      {isNew && (
        <Field label="Section" htmlFor="knowledge-section" hint={page ? `Saved as ${page}` : 'The page is named from its title.'} problems={shown.name}>
          <TextInput id="knowledge-section" value={state.section} onChange={section => set({ section })} placeholder="processes/releases (empty for the top)" />
        </Field>
      )}
      <Field label="Description" htmlFor="knowledge-description" hint="One sentence. Agents see it before they open a page." problems={shown.description}>
        <TextInput id="knowledge-description" value={state.description} onChange={description => set({ description })} />
      </Field>
      <Field label="Tags" htmlFor="knowledge-tags" problems={shown.tags}>
        <TagsInput tags={state.tags} onChange={tags => set({ tags })} />
      </Field>
      <Field label="Properties" hint="Your section's own fields, offered from its other pages. Add any you need." problems={shown.properties}>
        <PropertyRows rows={state.properties} offered={offered} onChange={properties => set({ properties })} />
      </Field>
      <TextEditor
        value={state.body} onChange={body => set({ body })} problems={[...(shown.content ?? []), ...(shown.frontMatter ?? [])]}
        embed={pageEmbed(owner, page === '' ? state.section.trim().replace(/^\/+|\/+$/g, '') : pageFolder(page))}
      />
    </>
  )
}
