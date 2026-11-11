import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Plus, Sparkles, Trash2, BookOpen, RefreshCw } from 'lucide-react'
import { deriveSlug } from '@agenthix/core'
import type { AgentDetail } from '../types'
import { MdFileEditor } from '../MdFileEditor'
import { SkillLibraryPicker, type LibrarySkillItem } from '../SkillLibraryPicker'
import { FIELD, ROW_CHOSEN, ROW_ITEM } from '../../primitives/controlStyles'
import { BUTTON_GHOST, BUTTON_PRIMARY, BUTTON_SECONDARY } from '../../primitives/buttonStyles'

// ── Frontmatter validation ────────────────────────────────────────────────────

function validateSkillFrontmatter(yaml: string): string[] {
  const errors: string[] = []
  if (!yaml.match(/^name:\s*\S/m)) errors.push('name is required')
  if (!yaml.match(/^description:\s*\S/m)) errors.push('description is required')
  return errors
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentSkill {
  slug: string
  name: string
  description: string
  content: string
  version: number
  installedFrom: string | null
}

export interface LibrarySkill {
  id: string
  slug: string
  name: string
  description: string
  content: string
  scope: 'PLATFORM' | 'ORG'
}

export interface SkillsTabQueries {
  getAgentSkills: (input: { agentId: string }) => Promise<AgentSkill[]>
  getSkillLibrary: (input: { scope: 'PLATFORM' }) => Promise<LibrarySkill[]>
  getInstalledSkillVersions: (input: { slugs: string[] }) => Promise<Record<string, number>>
}

export interface SkillsTabActions {
  saveAgentSkill: (input: { agentId: string; slug: string; content: string }) => Promise<unknown>
  deleteAgentSkill: (input: { agentId: string; slug: string }) => Promise<unknown>
  installSkill: (input: { skillId: string; target: { scope: 'AGENT'; agentId: string } }) => Promise<unknown>
}

export interface SkillsTabProps {
  agent: AgentDetail
  queries: SkillsTabQueries
  actions: SkillsTabActions
}

// ── SkillsTab ─────────────────────────────────────────────────────────────────

export function SkillsTab({ agent, queries, actions }: SkillsTabProps) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const refetchSkills = useCallback(async () => {
    const data = await queries.getAgentSkills({ agentId: agent.id })
    setSkills(data)
  }, [queries, agent.id])
  useEffect(() => { void refetchSkills() }, [refetchSkills])

  const [library, setLibrary] = useState<LibrarySkill[]>([])
  const refetchLibrary = useCallback(async () => {
    const data = await queries.getSkillLibrary({ scope: 'PLATFORM' })
    setLibrary(data)
  }, [queries])
  useEffect(() => { void refetchLibrary() }, [refetchLibrary])

  const librarySlugs = useMemo(() => new Set(library.map(l => l.slug)), [library])
  const installedLibrarySlugs = useMemo(
    () => skills.filter(s => librarySlugs.has(s.slug)).map(s => s.slug),
    [skills, librarySlugs]
  )

  const [versionMap, setVersionMap] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!installedLibrarySlugs.length) { setVersionMap({}); return }
    void queries.getInstalledSkillVersions({ slugs: installedLibrarySlugs }).then(setVersionMap)
  }, [queries, installedLibrarySlugs.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [isAnyEditing, setIsAnyEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [installBusy, setInstallBusy] = useState<string | null>(null)
  const [showLibraryModal, setShowLibraryModal] = useState(false)

  useEffect(() => {
    if (!selectedSlug && skills.length > 0) setSelectedSlug(skills[0].slug)
  }, [skills.length])

  const selected = skills.find(s => s.slug === selectedSlug) ?? null

  const isLibrarySkill = (skill: { installedFrom: string | null; slug: string }) =>
    skill.installedFrom !== null || librarySlugs.has(skill.slug)

  const handleSelect = (slug: string) => {
    if (isAnyEditing) return
    setSelectedSlug(slug)
    setDeleteConfirm(null)
  }

  const handleSave = async (content: string) => {
    if (!selected) return
    await actions.saveAgentSkill({ agentId: agent.id, slug: selected.slug, content })
    await refetchSkills()
  }

  const handleDelete = async (slug: string) => {
    try {
      await actions.deleteAgentSkill({ agentId: agent.id, slug })
    } catch (e) {
      console.error('Failed to delete skill:', e)
      setDeleteConfirm(null)
      return
    }
    setDeleteConfirm(null)
    if (selectedSlug === slug) {
      const remaining = skills.filter(s => s.slug !== slug)
      setSelectedSlug(remaining[0]?.slug ?? null)
    }
    await refetchSkills()
  }

  const handleAddSkill = async () => {
    const name = newSkillName.trim()
    if (!name) return
    const slug = deriveSlug(name)
    const content = `---\nname: ${name}\ndescription: Describe what this skill does.\n---\n\n# ${name}\n\n...instructions...\n`
    await actions.saveAgentSkill({ agentId: agent.id, slug, content })
    setAdding(false)
    setNewSkillName('')
    await refetchSkills()
    setSelectedSlug(slug)
  }

  const handleInstallFromLibrary = async (skill: LibrarySkillItem) => {
    setInstallBusy(skill.slug)
    try {
      await actions.installSkill({ skillId: skill.id, target: { scope: 'AGENT', agentId: agent.id } })
      await refetchSkills()
      setSelectedSlug(skill.slug)
    } finally {
      setInstallBusy(null)
    }
  }

  const installedSlugs = new Set(skills.map(s => s.slug))

  return (
    <>
    <div className="flex rounded-2xl bg-card border border-border min-h-[480px] overflow-hidden">
      {/* Left sidebar */}
      <div className="w-52 shrink-0 border-r border-border-subtle flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b border-border-subtle">
          <span className="text-micro font-medium uppercase tracking-wide text-text-muted">SKILLS</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLibraryModal(true)}
              className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              title="Browse skill library"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setAdding(true); setNewSkillName('') }}
              className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              title="New custom skill"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {adding && (
          <div className="px-3 py-2 border-b border-border-subtle space-y-1.5">
            <input
              autoFocus
              type="text"
              value={newSkillName}
              onChange={e => setNewSkillName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSkill(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="Skill name..."
              className={`${FIELD} w-full rounded-lg px-2 py-1.5 text-small placeholder:text-text-muted/70`}
            />
            <div className="flex gap-1">
              <button onClick={handleAddSkill} disabled={!newSkillName.trim()}
                className={`flex-1 py-1 rounded-lg text-micro font-medium cursor-pointer ${BUTTON_PRIMARY}`}>
                Add
              </button>
              <button onClick={() => setAdding(false)}
                className={`flex-1 py-1 rounded-lg text-micro cursor-pointer ${BUTTON_SECONDARY}`}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {skills.length === 0 && !adding ? (
            <div className="px-3 py-6 text-center text-small text-text-muted/70 italic">No skills yet</div>
          ) : (
            skills.map(skill => {
              const isSelected = selectedSlug === skill.slug
              const isLocked = isAnyEditing && !isSelected
              return (
                <button
                  key={skill.slug}
                  onClick={() => handleSelect(skill.slug)}
                  disabled={isLocked}
                  title={isLocked ? 'Save or cancel to switch skills' : undefined}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? `border-l-2 border-transparent ${ROW_CHOSEN}`
                      : isLocked
                        ? 'border-l-2 border-transparent text-text-muted/70 cursor-not-allowed'
                        : `border-l-2 border-transparent cursor-pointer ${ROW_ITEM}`
                  }`}
                >
                  {isLibrarySkill(skill)
                    ? <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    : <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                  <span className="flex-1 truncate text-small">{skill.name}</span>
                  {!isLibrarySkill(skill) && (
                    <span className="text-micro font-medium shrink-0 opacity-60">custom</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-border-subtle">
          <p className="text-micro text-text-muted/70 italic leading-relaxed">
            Platform skills (e.g. Task Management) are always active and not shown here.
          </p>
        </div>
      </div>

      {/* Right panel */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
            <span className="text-body font-medium text-text-primary">{selected.name}</span>
            {isLibrarySkill(selected)
              ? <span className="text-micro font-medium px-2 py-0.5 rounded-full bg-chip text-text-secondary">Library</span>
              : <span className="text-micro font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">Custom</span>}
            <span className="text-micro text-text-muted/70">SKILL.md</span>
            <div className="ml-auto flex items-center gap-2">
              {isLibrarySkill(selected) && (() => {
                const libSkill = library.find(l => l.slug === selected.slug)
                if (!libSkill) return null
                const libVersion = versionMap[selected.slug]
                const hasUpdate = libVersion != null && libVersion > selected.version
                const busy = installBusy === libSkill.slug
                return (
                  <button
                    onClick={() => hasUpdate && handleInstallFromLibrary(libSkill)}
                    disabled={!hasUpdate || busy}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_GHOST} text-warning! not-disabled:hover:text-warning!`}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {busy ? 'Updating...' : 'Update'}
                  </button>
                )
              })()}
              {deleteConfirm === selected.slug ? (
                <>
                  <span className="text-small text-danger">Delete?</span>
                  <button onClick={() => handleDelete(selected.slug)}
                    className={`px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_GHOST} text-danger! not-disabled:hover:text-danger!`}>Yes</button>
                  <button onClick={() => setDeleteConfirm(null)}
                    className={`px-3 py-1.5 rounded-lg text-small cursor-pointer ${BUTTON_GHOST}`}>No</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(selected.slug)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_GHOST} not-disabled:hover:text-danger!`}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            <MdFileEditor
              content={selected.content}
              onSave={handleSave}
              isLibrary={isLibrarySkill(selected)}
              validateFrontmatter={validateSkillFrontmatter}
              frontmatterFallback={`name: ${selected.name}\ndescription: `}
              placeholder="Add skill instructions…"
              onEditingChange={setIsAnyEditing}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <Sparkles className="w-8 h-8 text-text-muted/50" />
          <p className="text-body text-text-muted">No skills yet</p>
          <p className="text-small text-text-muted/70">Add a skill to give this agent domain knowledge injected at runtime. Platform skills (Task Management) are always active.</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setShowLibraryModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body font-medium cursor-pointer ${BUTTON_SECONDARY}`}>
              <BookOpen className="w-3.5 h-3.5" /> From Library
            </button>
            <button onClick={() => { setAdding(true); setNewSkillName('') }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body font-medium cursor-pointer ${BUTTON_SECONDARY}`}>
              <Plus className="w-3.5 h-3.5" /> New Skill
            </button>
          </div>
        </div>
      )}
    </div>

    <SkillLibraryPicker
      open={showLibraryModal}
      onClose={() => setShowLibraryModal(false)}
      library={library}
      installedSlugs={installedSlugs}
      installedSkills={skills}
      versionMap={versionMap}
      installBusy={installBusy}
      onInstall={handleInstallFromLibrary}
    />
    </>
  )
}
