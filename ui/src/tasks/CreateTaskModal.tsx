import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { Button } from '../primitives/Button'
import { Input } from '../primitives/Input'
import { Textarea } from '../primitives/Textarea'
import { ModalDialog } from '../primitives/Modal'
import { FormField } from '../primitives/FormField'
import { NativeSelect } from '../primitives/NativeSelect'
import { PrioritySelector, type Priority } from '../primitives/PrioritySelector'
import type { CreateTaskInput } from '../board/types'
import type { BoardStage } from './TaskMetaSidebar'

// ── Types ─────────────────────────────────────────────────────────────

interface BoardOption {
  id: string
  name: string
  status: string
  stages: BoardStage[]
}

export type ModelFieldSlot = (state: { agentId: string | null; value: string; onChange: (value: string) => void }) => ReactNode

export interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  defaultBoardId?: string
  defaultStage?: string
  /** A title already typed (the Tasks tool's "More details"). */
  defaultTitle?: string
  agents: Array<{ id: string; name: string }>
  boards: BoardOption[]
  onSubmit: (input: CreateTaskInput) => Promise<void>
  onCreated?: () => void
  /** The model the task's runs name, when the host offers one. */
  modelField?: ModelFieldSlot
}

// ── Status label map ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

// ── Component ─────────────────────────────────────────────────────────

export function CreateTaskModal({
  open,
  onClose,
  projectId,
  defaultBoardId,
  defaultStage,
  defaultTitle,
  agents,
  boards,
  onSubmit,
  onCreated,
  modelField,
}: CreateTaskModalProps) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority]     = useState<Priority>('MEDIUM')
  const [boardId, setBoardId]       = useState(defaultBoardId ?? '')
  const [stageName, setStageName]   = useState(defaultStage ?? '')
  const [agentId, setAgentId]       = useState('')
  const [modelChoice, setModelChoice] = useState('')
  const [saving, setSaving]         = useState(false)

  const selectedBoard = boards.find((b) => b.id === boardId) ?? null
  const sortedStages: BoardStage[] = selectedBoard
    ? [...selectedBoard.stages].sort((a, b) => ((a as any).order ?? 0) - ((b as any).order ?? 0))
    : []

  // Auto-select first TODO stage when board changes
  useEffect(() => {
    if (!boardId) { setStageName(''); return }
    const board = boards.find((b) => b.id === boardId)
    if (!board) return
    const firstTodo = board.stages.find((s) => s.status === 'TODO')
    setStageName(defaultStage ?? firstTodo?.name ?? '')
  }, [boardId, boards, defaultStage])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? '')
      setDescription('')
      setPriority('MEDIUM')
      setBoardId(defaultBoardId ?? '')
      setStageName(defaultStage ?? '')
      setAgentId('')
    }
  }, [open, defaultBoardId, defaultStage])

  const buildHint = (): string => {
    if (!boardId || !selectedBoard) return 'Task will be added to the project backlog'
    const stage = sortedStages.find((s) => s.name === stageName)
    const parts = [selectedBoard.name]
    if (stage) parts.push(stage.label)
    return `Task will be added to: ${parts.join(' > ')}`
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSubmit({
        projectId,
        title: title.trim(),
        description: description || undefined,
        priority,
        assignedAgentId: agentId || undefined,
        ...(modelChoice ? { modelChoice } : {}),
        boardId: boardId || undefined,
        stage: stageName || undefined,
      })
      onCreated?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="New Task" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Title */}
        <FormField label="Title *" htmlFor="ct-title">
          <Input
            id="ct-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            placeholder="What needs to be done?"
          />
        </FormField>

        {/* Description */}
        <FormField label="Description" htmlFor="ct-desc">
          <Textarea
            id="ct-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional details..."
          />
        </FormField>

        {/* Priority + Board row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Priority">
            <PrioritySelector value={priority} onChange={setPriority} />
          </FormField>

          <FormField label="Board" htmlFor="ct-board">
            <NativeSelect
              id="ct-board"
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
            >
              <option value="">Backlog (no board)</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        {/* Stage selector */}
        {selectedBoard && (
          <FormField label="Stage" htmlFor="ct-stage">
            <NativeSelect
              id="ct-stage"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            >
              {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map((s) => {
                const stagesInGroup = sortedStages.filter((st) => st.status === s)
                if (stagesInGroup.length === 0) return null
                return (
                  <optgroup key={s} label={STATUS_LABELS[s]}>
                    {stagesInGroup.map((st) => (
                      <option key={st.name} value={st.name}>{st.label}</option>
                    ))}
                  </optgroup>
                )
              })}
            </NativeSelect>
          </FormField>
        )}

        {/* Agent */}
        <FormField label="Agent" htmlFor="ct-agent">
          <NativeSelect
            id="ct-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </NativeSelect>
        </FormField>

        {modelField?.({ agentId: agentId || null, value: modelChoice, onChange: setModelChoice })}

        {/* Placement hint */}
        <p className="text-small text-text-muted italic">{buildHint()}</p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving ? 'Creating...' : 'Create Task'}
          </Button>
        </div>
      </form>
    </ModalDialog>
  )
}
