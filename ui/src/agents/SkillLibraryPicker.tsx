import { useState, useEffect } from 'react'
import { X, BookOpen, Loader2, Plus, RefreshCw, Check } from 'lucide-react'
import { parseFrontmatter, MarkdownPreview } from './helpers'
import { FIELD, ROW_CHOSEN, ROW_ITEM } from '../primitives/controlStyles'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '../primitives/buttonStyles'

export interface LibrarySkillItem {
  id: string
  slug: string
  name: string
  description: string
  content: string
}

interface SkillLibraryPickerProps {
  open: boolean
  onClose: () => void
  library: LibrarySkillItem[]
  installedSlugs: Set<string>
  installedSkills: { slug: string; version: number }[]
  versionMap: Record<string, number>
  installBusy: string | null
  onInstall: (skill: LibrarySkillItem) => void
}

export function SkillLibraryPicker({
  open,
  onClose,
  library,
  installedSlugs,
  installedSkills,
  versionMap,
  installBusy,
  onInstall,
}: SkillLibraryPickerProps) {
  const [search, setSearch] = useState('')
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      setPreviewSlug(library[0]?.slug ?? null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const filtered = library.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  )

  const preview = library.find(s => s.slug === previewSlug) ?? filtered[0] ?? null

  const getStatus = (slug: string): 'installed' | 'update' | 'none' => {
    if (!installedSlugs.has(slug)) return 'none'
    const installed = installedSkills.find(s => s.slug === slug)
    const libVersion = versionMap[slug]
    if (installed && libVersion != null && libVersion > installed.version) return 'update'
    return 'installed'
  }

  const previewStatus = preview ? getStatus(preview.slug) : 'none'
  const previewLibVersion = preview ? versionMap[preview.slug] : undefined
  const { body: previewBody } = preview ? parseFrontmatter(preview.content) : { body: '' }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[900px] mx-4 flex flex-col bg-popover border border-border rounded-2xl overflow-hidden shadow-pop" style={{ height: '640px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-text-secondary" />
            <span className="text-body font-medium text-text-primary">Skill Library</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: search + list */}
          <div className="w-60 shrink-0 border-r border-border-subtle flex flex-col">
            <div className="p-2 border-b border-border-subtle shrink-0">
              <input
                autoFocus
                placeholder="Search skills..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${FIELD} w-full rounded-lg px-3 py-1.5 text-small text-text-secondary`}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-small text-text-muted/70 italic">No results</div>
              ) : filtered.map(skill => {
                const status = getStatus(skill.slug)
                const isSelected = skill.slug === (previewSlug ?? filtered[0]?.slug)
                return (
                  <button
                    key={skill.slug}
                    onClick={() => setPreviewSlug(skill.slug)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer border border-transparent ${isSelected ? ROW_CHOSEN : ROW_ITEM}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-small font-medium truncate ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>{skill.name}</span>
                      {status === 'installed' && (
                        <span className="shrink-0 text-micro font-medium text-success bg-success/10 border border-success/20 rounded px-1.5 py-0.5">✓</span>
                      )}
                      {status === 'update' && (
                        <span className="shrink-0 text-micro font-medium text-warning bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5">↑</span>
                      )}
                    </div>
                    <div className="text-micro text-text-muted leading-snug line-clamp-2">{skill.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: preview */}
          {preview ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body font-medium text-text-primary truncate">{preview.name}</span>
                  {previewStatus === 'installed' && (
                    <span className="shrink-0 text-micro font-medium text-success bg-success/10 border border-success/20 rounded-md px-2.5 py-1">✓ Installed</span>
                  )}
                  {previewStatus === 'update' && (
                    <span className="shrink-0 text-micro font-medium text-warning bg-warning/10 border border-warning/20 rounded-md px-2.5 py-1">↑ Update available</span>
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-micro text-text-muted">
                  {previewLibVersion != null && <span>v{previewLibVersion}</span>}
                  <span>PLATFORM</span>
                  <span>slug: {preview.slug}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <MarkdownPreview content={previewBody} />
              </div>
              <div className="px-5 py-3 border-t border-border-subtle flex justify-end gap-2 shrink-0">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-surface-2 border border-border rounded-lg text-small text-text-secondary hover:text-text-secondary transition-colors cursor-pointer"
                >
                  Close
                </button>
                {previewStatus === 'none' && (
                  <button
                    onClick={() => onInstall(preview)}
                    disabled={installBusy === preview.slug}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_PRIMARY}`}
                  >
                    {installBusy === preview.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    {installBusy === preview.slug ? 'Adding...' : 'Add'}
                  </button>
                )}
                {previewStatus === 'update' && (
                  <button
                    onClick={() => onInstall(preview)}
                    disabled={installBusy === preview.slug}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_SECONDARY}`}
                  >
                    {installBusy === preview.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {installBusy === preview.slug ? 'Updating...' : 'Update'}
                  </button>
                )}
                {previewStatus === 'installed' && (
                  <button disabled className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-success/10 border border-success/20 rounded-lg text-small font-medium text-success opacity-50 cursor-default">
                    <Check className="w-3 h-3" /> Already added
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-small text-text-muted/70 italic">No results</div>
          )}
        </div>
      </div>
    </div>
  )
}
