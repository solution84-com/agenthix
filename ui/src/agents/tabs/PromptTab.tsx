import { useState, useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { AgentDetail } from '../types'
import { SegmentedControl } from '../../primitives/SegmentedControl'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '../../primitives/buttonStyles'
import { FOCUS_RING } from '../../primitives/controlStyles'
import {
  PROMPT_SECTION_KEY,
  EDITABLE_SECTION_FILES,
  type PromptSection,
  type PromptSectionKey,
} from '../promptSections'
import { useAttentionWhen } from '../../attention/useAttentionWhen'
import { ReadFailure } from '../../attention/ReadFailure'
import { isFinal, retryRead } from '../../attention/retry'

export type PromptMode = 'chat' | 'task'

export interface PromptTabQueries {
  getAgentPromptPreview: (input: { agentId: string; mode: PromptMode }) => Promise<{ sections: PromptSection[] }>
}

export interface PromptTabActions {
  updateAgentFile: (input: { agentId: string; filename: string; content: string }) => Promise<unknown>
}

export interface PromptTabSlots {
  renderEditor: (props: {
    value: string
    onChange: (next: string) => void
    placeholder?: string
  }) => ReactNode
  renderMarkdown: (props: { content: string; className?: string }) => ReactNode
}

export interface PromptTabProps {
  agent: AgentDetail
  queries: PromptTabQueries
  actions: PromptTabActions
  slots: PromptTabSlots
}

const MODE_LABELS: Record<PromptMode, string> = {
  chat:      'Chat',
  task:      'Task',
}

const MODE_DESCRIPTIONS: Record<PromptMode, string> = {
  chat:      'Sent when a user opens a chat session with this agent.',
  task:      'Sent when the agent is executing an assigned task.',
}

const SECTION_ICONS: Partial<Record<PromptSectionKey, string>> = {
  [PROMPT_SECTION_KEY.IDENTITY]:         '👤',
  [PROMPT_SECTION_KEY.ORG]:              '🏢',
  [PROMPT_SECTION_KEY.INSTRUCTIONS]:     '📋',
  [PROMPT_SECTION_KEY.MEMORY]:           '🧠',
  [PROMPT_SECTION_KEY.AGENDA]:           '📅',
  [PROMPT_SECTION_KEY.EXECUTION]:        '⚙️',
  [PROMPT_SECTION_KEY.PROJECT]:          '📁',
  [PROMPT_SECTION_KEY.BOARD]:            '📋',
  [PROMPT_SECTION_KEY.TASK_DETAIL]:      '✅',
}

export function PromptTab({ agent, queries, actions, slots }: PromptTabProps) {
  const [mode, setMode] = useState<PromptMode>('chat')

  const [preview, setPreview] = useState<{ sections: PromptSection[] } | null>(null)
  // The preview's read failed through its retries: said in place of it, a final answer in its own words.
  const [previewError, setPreviewError] = useState<{ final: string | null } | null>(null)
  // The host may build `queries` inline; a new object alone must not refetch.
  const queriesRef = useRef(queries)
  queriesRef.current = queries
  // Only the newest request may set the view: a slow Chat answer arriving after a switch to Task is dropped.
  const latestRequest = useRef(0)
  const refetchPreview = useCallback(async () => {
    const ticket = ++latestRequest.current
    setPreviewError(null)
    try {
      const r = await retryRead(() => queriesRef.current.getAgentPromptPreview({ agentId: agent.id, mode }))
      if (ticket === latestRequest.current) setPreview(r)
    } catch (err) {
      if (ticket === latestRequest.current) setPreviewError({ final: isFinal(err) ? (err as Error)?.message || 'These instructions are not there for you.' : null })
    }
  }, [agent.id, mode])
  useEffect(() => {
    setPreview(null)
    void refetchPreview()
    return () => { latestRequest.current++ }
  }, [refetchPreview])

  const [editingKey, setEditingKey]   = useState<PromptSectionKey | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const errorDialog = useAttentionWhen(saveError, { kind: 'alert' })

  const startEdit = useCallback((section: PromptSection) => {
    if (editingKey) return
    setEditingKey(section.key)
    setEditContent(section.content)
  }, [editingKey])

  const cancelEdit = useCallback(() => {
    setEditingKey(null)
    setEditContent('')
    setSaveError(null)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingKey) return
    const filename = EDITABLE_SECTION_FILES[editingKey]
    if (!filename) return
    setSaving(true)
    setSaveError(null)
    try {
      await actions.updateAgentFile({ agentId: agent.id, filename, content: editContent })
      await refetchPreview()
      setEditingKey(null)
      setEditContent('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [editingKey, editContent, agent.id, actions, refetchPreview])

  // Reset editing state when switching modes
  const handleModeChange = (next: PromptMode) => {
    cancelEdit()
    setMode(next)
  }

  const sections = (preview?.sections ?? []) as PromptSection[]

  return (
    <div className="space-y-4">

      {/* Mode switcher */}
      <SegmentedControl
        kind="tabs" label="Prompt for" value={mode} onChange={handleModeChange}
        options={(['chat', 'task'] as PromptMode[]).map(m => ({ value: m, label: MODE_LABELS[m] }))}
      />

      {/* Mode description */}
      <p className="text-micro text-text-muted -mt-1">{MODE_DESCRIPTIONS[mode]}</p>

      <p className="text-micro text-text-muted -mt-2">
        A saved section takes effect at the agent&apos;s next run.
      </p>

      {/* Prompt content */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
          <span className="text-micro font-medium uppercase tracking-wide text-text-muted/70">System Prompt</span>
          <span className="text-micro text-text-muted/70">Tap editable sections to update them</span>
        </div>

        {errorDialog}
        {!preview && previewError ? (
          previewError.final !== null
            ? <ReadFailure what="The instructions" final={previewError.final} />
            : <ReadFailure what="The instructions" retry={() => void refetchPreview()} />
        ) : !preview ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-text-muted/70 animate-spin" />
          </div>

        ) : (
          <div className="divide-y divide-border-subtle">
            {sections.map((section) => {
              const isEditing  = editingKey === section.key
              const isEditable = section.editable
              return (
                <div
                  key={section.key}
                  {...(isEditable && !editingKey ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Edit ${section.label}`,
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                      e.preventDefault()
                      startEdit(section)
                    },
                  } : {})}
                  onClick={() => isEditable && !editingKey ? startEdit(section) : undefined}
                  className={`px-4 py-3.5 transition-colors ${
                    isEditable && !editingKey
                      ? `cursor-pointer hover:bg-surface-hover active:bg-surface-pressed group ${FOCUS_RING}`
                      : isEditing
                        ? 'bg-selected cursor-default'
                        : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-small">{SECTION_ICONS[section.key] ?? '▪'}</span>
                    <span className="text-micro font-medium uppercase tracking-wide text-text-muted/70 group-hover:text-text-muted transition-colors">
                      {section.label}
                    </span>
                    {!isEditable && (
                      <span className="ml-auto text-micro font-medium uppercase tracking-wide text-text-muted/50">
                        auto · read-only
                      </span>
                    )}
                    {isEditable && !isEditing && !editingKey && (
                      <span className="ml-auto text-micro text-text-muted/70 group-hover:text-text-secondary transition-colors flex items-center gap-1 font-medium">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        tap to edit
                      </span>
                    )}
                  </div>

                  {!isEditing && (
                    section.content
                      ? slots.renderMarkdown({ content: section.content, className: 'text-text-secondary text-micro' })
                      : <span className="text-text-muted/70 italic text-small">Empty — tap to add content</span>
                  )}

                  {isEditing && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <div className="mt-1">
                        {slots.renderEditor({
                          value: editContent,
                          onChange: setEditContent,
                          placeholder: 'Empty — write something…',
                        })}
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={cancelEdit}
                          className={`px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_SECONDARY}`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className={`px-3 py-1.5 rounded-lg text-small font-medium cursor-pointer ${BUTTON_PRIMARY}`}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
