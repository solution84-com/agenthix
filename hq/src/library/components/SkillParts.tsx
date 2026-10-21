/**
 * A library skill read and written: its content shown, and the form that makes or changes one.
 * The Library's Skills tab opens them in a dialog (`SkillDialog.tsx`).
 */
import { useState } from 'react'
import { useAction } from 'wasp/client/operations'
import { createLibrarySkill, updateLibrarySkill } from 'wasp/client/operations'
import { Download, Pencil, Trash2 } from 'lucide-react'
import { deriveSlug } from '@agenthix/core'

// -- Types -------------------------------------------------------------------

// Library skill record from DB (content read from disk at query time)
export type LibrarySkill = {
  id: string
  slug: string
  name: string
  description: string
  content: string
  scope: 'PLATFORM' | 'ORG'
  orgId: string | null
}

// -- Helpers -----------------------------------------------------------------

function MarkdownLine({ line }: { line: string }) {
  if (line.startsWith('# ')) return <div className="text-body font-medium text-text-primary mt-4 first:mt-0">{line.slice(2)}</div>
  if (line.startsWith('## ')) return <div className="text-body font-medium text-text-primary mt-3">{line.slice(3)}</div>
  if (line.startsWith('### ')) return <div className="text-body font-semibold text-text-secondary mt-2">{line.slice(4)}</div>
  if (line.startsWith('- ')) return <div className="pl-4 text-text-secondary text-body before:content-['·'] before:mr-2 before:text-text-muted">{line.slice(2)}</div>
  if (line === '---') return <hr className="border-border my-4" />
  if (line === '') return <div className="h-1" />
  return <div className="text-text-secondary text-body">{line}</div>
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="font-mono leading-relaxed">
      {content.split('\n').map((l, i) => <MarkdownLine key={i} line={l} />)}
    </div>
  )
}


export const SKILL_TEMPLATE = (name: string) =>
  `# ${name}\n\nDescribe the skill here.\n`

// -- Parts -------------------------------------------------------------------

export function SkillViewer({
  skill,
  onEdit,
  onDelete,
  onInstall,
  installLabel,
  readonly,
}: {
  skill: LibrarySkill
  onEdit?: () => void
  onDelete?: () => void
  onInstall?: () => void
  installLabel?: string
  readonly?: boolean
}) {
  return (
    <div className="flex-1 p-6">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">{skill.name}</h2>
            <p className="text-body text-text-muted mt-1">{skill.description}</p>
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-micro font-medium bg-surface-2 text-text-muted">
                slug: {skill.slug}
              </span>
            </div>
          </div>
          {!readonly && (
            <div className="flex items-center gap-2 shrink-0">
              {onInstall && installLabel && (
                <button
                  onClick={onInstall}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-small font-medium transition-colors"
                >
                  <Download className="w-3 h-3" />
                  {installLabel}
                </button>
              )}
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-hover text-text-secondary text-small font-medium transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-small font-medium transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="rounded-xl bg-surface-1 border border-border-subtle p-4">
        <MarkdownPreview content={skill.content} />
      </div>
    </div>
  )
}

export function SkillEditor({
  initial,
  orgId,
  projectId,
  scope,
  onSave,
  onCancel,
}: {
  initial: { id?: string; slug: string; name: string; description: string; content: string }
  orgId?: string
  projectId?: string
  scope: 'PLATFORM' | 'ORG'
  onSave: () => void
  onCancel: () => void
}) {
  const [slug, setSlug] = useState(initial.slug)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [content, setContent] = useState(initial.content)
  const [saving, setSaving] = useState(false)
  const isNew = !initial.id
  const createFn = useAction(createLibrarySkill)
  const updateFn = useAction(updateLibrarySkill)

  async function handleSave() {
    setSaving(true)
    try {
      if (isNew) {
        await createFn({ scope, orgId, slug, name, description, content })
      } else {
        await updateFn({ id: initial.id!, name, description, content })
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 p-6 flex flex-col gap-4">
      {isNew && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-micro font-medium uppercase tracking-wide text-text-muted block mb-1">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(deriveSlug(e.target.value))}
              placeholder="my-skill"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary font-mono focus:outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex-1">
            <label className="text-micro font-medium uppercase tracking-wide text-text-muted block mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Skill"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      )}
      {isNew && (
        <div>
          <label className="text-micro font-medium uppercase tracking-wide text-text-muted block mb-1">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What this skill does"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50"
          />
        </div>
      )}
      <div className="flex-1 flex flex-col">
        <label className="text-micro font-medium uppercase tracking-wide text-text-muted block mb-1">Content</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 min-h-[400px] w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary font-mono focus:outline-none focus:border-accent/50 resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={saving || !slug || !name}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-on-accent text-small font-medium transition-colors disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-hover text-text-secondary text-small font-medium transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
