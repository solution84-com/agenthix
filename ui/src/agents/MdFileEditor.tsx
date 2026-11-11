import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { InlineEdit } from '../primitives/InlineEdit'
import { FIELD, FOCUS_RING } from '../primitives/controlStyles'
import { Button } from '../primitives/Button'

// ── Frontmatter parsing ───────────────────────────────────────────────────────

export function parseMdFrontmatter(content: string): { yaml: string | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return { yaml: null, body: content }
  return { yaml: match[1], body: content.slice(match[0].length).trimStart() }
}

// ── Read-only frontmatter display ─────────────────────────────────────────────

function ReadOnlyFrontmatter({ yaml }: { yaml: string }) {
  const rows: { label: string; value: string }[] = []
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (!k || !v) continue
    if (k === 'installed_at' || k === 'installedAt') {
      try { rows.push({ label: k, value: new Date(v).toLocaleString() }) }
      catch { rows.push({ label: k, value: v }) }
    } else {
      rows.push({ label: k, value: v })
    }
  }
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="space-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-2 font-mono text-small">
            <span className="text-text-muted shrink-0 min-w-[80px]">{label}:</span>
            <span className="text-text-secondary break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Editable frontmatter ──────────────────────────────────────────────────────

function EditableFrontmatter({ yaml, onSave, validate, onEditingChange }: {
  yaml: string
  onSave: (yaml: string) => Promise<void>
  validate?: (yaml: string) => string[]
  onEditingChange?: (editing: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(yaml)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(yaml) }, [yaml])

  const errors = editing && validate ? validate(draft) : []

  const startEdit = () => { setEditing(true); onEditingChange?.(true) }
  const cancel = () => { setDraft(yaml); setEditing(false); onEditingChange?.(false) }

  const commit = async () => {
    if (errors.length > 0) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
      onEditingChange?.(false)
    } catch {
      // keep open on failure
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const rows: { label: string; value: string }[] = []
    for (const line of yaml.split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k && v) rows.push({ label: k, value: v })
    }
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Edit the frontmatter"
        onClick={startEdit}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit() }
        }}
        className={`cursor-text rounded-lg px-3 py-2 hover:bg-surface-hover active:bg-surface-pressed transition-colors ${FOCUS_RING}`}
      >
        <div className="rounded-xl bg-card border border-border p-3">
          {rows.length > 0 ? (
            <div className="space-y-1">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex gap-2 font-mono text-small">
                  <span className="text-text-muted shrink-0 min-w-[80px]">{label}:</span>
                  <span className="text-text-secondary break-all">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-text-muted italic text-small">Click to add frontmatter…</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 px-3">
      <textarea
        autoFocus
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onFocus={e => {
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        rows={5}
        placeholder="name: My Skill&#10;description: What it does."
        className={`${FIELD} w-full rounded-lg px-3 py-2 font-mono text-small resize-none ${errors.length > 0 ? 'border-danger/40!' : ''}`}
      />
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-1.5 text-small text-danger">
              <span className="text-danger/60">·</span> {err}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={commit} disabled={saving || errors.length > 0} leadingIcon={<Check size={12} />}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={cancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── MdFileEditor ──────────────────────────────────────────────────────────────

export interface MdFileEditorProps {
  /** Full file content (frontmatter + body). */
  content: string
  /** Called with the full reassembled content after any section save. */
  onSave: (content: string) => Promise<void>
  /** If true, frontmatter is displayed read-only. Default: false. */
  isLibrary?: boolean
  /** If false, the metadata section is hidden entirely. Default: true. */
  showFrontmatter?: boolean
  /** Injected validator for the frontmatter textarea. Only used when !isLibrary. */
  validateFrontmatter?: (yaml: string) => string[]
  /**
   * Fallback YAML used as the initial draft when the file has no frontmatter
   * and isLibrary is false.
   */
  frontmatterFallback?: string
  placeholder?: string
  /** Label shown above the body section. Default: 'Instructions'. */
  bodyLabel?: string
  onEditingChange?: (editing: boolean) => void
}

export function MdFileEditor({
  content,
  onSave,
  isLibrary = false,
  showFrontmatter = true,
  validateFrontmatter,
  frontmatterFallback = '',
  placeholder,
  bodyLabel = 'Instructions',
  onEditingChange,
}: MdFileEditorProps) {
  const { yaml, body } = parseMdFrontmatter(content)

  const handleSaveBody = async (newBody: string) => {
    const newContent = yaml ? `---\n${yaml}\n---\n\n${newBody}` : newBody
    await onSave(newContent)
  }

  const handleSaveFrontmatter = async (newYaml: string) => {
    const newContent = `---\n${newYaml}\n---\n\n${body}`
    await onSave(newContent)
  }

  return (
    <div className="py-3 space-y-2">
      {/* Metadata section */}
      {showFrontmatter && (
        <div>
          <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 px-4 mb-1">Metadata</p>
          {isLibrary ? (
            <div className="px-4">
              {yaml && <ReadOnlyFrontmatter yaml={yaml} />}
            </div>
          ) : (
            <EditableFrontmatter
              yaml={yaml ?? frontmatterFallback}
              onSave={handleSaveFrontmatter}
              validate={validateFrontmatter}
              onEditingChange={onEditingChange}
            />
          )}
        </div>
      )}

      {/* Instructions section */}
      <div>
        <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 px-4 mb-1">{bodyLabel}</p>
        <div className="px-3">
          <InlineEdit
            value={body}
            onSave={handleSaveBody}
            markdown
            placeholder={placeholder ?? 'Click to edit…'}
            textClassName="text-body leading-relaxed"
            onEditingChange={onEditingChange}
          />
        </div>
      </div>
    </div>
  )
}
