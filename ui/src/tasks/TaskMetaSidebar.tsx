import { Trash2, Archive } from 'lucide-react'
import { NativeSelect } from '../primitives/NativeSelect'
import { AgentPicker, type AgentPickerOption } from './AgentPicker'

export interface BoardOption {
  id: string
  name: string
}

export interface BoardStage {
  name: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  label: string
}

export interface TaskMetaSidebarProps {
  /** Board selector. If `boards` omitted, the field is hidden. */
  boardId?: string | null
  boards?: BoardOption[]
  onBoardChange?: (boardId: string | null) => void

  /** Stage (when boardId is set and boardStages provided) or Status (otherwise). */
  status: string
  stage?: string | null
  boardStages?: BoardStage[]
  onStageChange?: (stage: string) => void
  onStatusChange?: (status: string) => void

  /** Priority. */
  priority: string
  onPriorityChange?: (priority: string) => void

  /** Agent picker. If `agents` omitted, the field is hidden. */
  assignedAgentId?: string | null
  agents?: AgentPickerOption[]
  onAgentChange?: (agentId: string | null) => void

  /** Archive button — caller manages confirm flag. Hidden if onArchive not provided. */
  confirmArchive?: boolean
  onArchive?: () => void

  /** Delete button — caller manages confirm flag. Hidden if onDelete not provided. */
  confirmDelete?: boolean
  onDelete?: () => void
}

export function TaskMetaSidebar({
  boardId,
  boards,
  onBoardChange,
  status,
  stage,
  boardStages = [],
  onStageChange,
  onStatusChange,
  priority,
  onPriorityChange,
  assignedAgentId,
  agents,
  onAgentChange,
  confirmArchive,
  onArchive,
  confirmDelete,
  onDelete,
}: TaskMetaSidebarProps) {
  const hasStages = !!boardId && boardStages.length > 0
  const showActions = onArchive || onDelete

  return (
    <div className="w-full lg:w-64 lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border-subtle px-4 py-6 space-y-4">
      {boards && (
        <Field label="Board">
          <NativeSelect
            value={boardId ?? ''}
            onChange={e => onBoardChange?.(e.target.value || null)}
            size="sm"
          >
            <option value="">Backlog</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </Field>
      )}

      <Field label={hasStages ? 'Stage' : 'Status'}>
        {hasStages ? (
          <NativeSelect
            value={stage ?? ''}
            onChange={e => onStageChange?.(e.target.value)}
            size="sm"
          >
            {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map(s => {
              const stagesForStatus = boardStages.filter(st => st.status === s)
              if (stagesForStatus.length === 0) return null
              return (
                <optgroup key={s} label={s.replace('_', ' ')}>
                  {stagesForStatus.map(st => (
                    <option key={st.name} value={st.name}>{st.label}</option>
                  ))}
                </optgroup>
              )
            })}
          </NativeSelect>
        ) : (
          <NativeSelect
            value={status}
            onChange={e => onStatusChange?.(e.target.value)}
            size="sm"
          >
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </NativeSelect>
        )}
      </Field>

      <Field label="Priority">
        <NativeSelect
          value={priority}
          onChange={e => onPriorityChange?.(e.target.value)}
          size="sm"
        >
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </NativeSelect>
      </Field>

      {agents && (
        <Field label="Agent">
          <AgentPicker
            currentAgentId={assignedAgentId ?? null}
            agents={agents}
            onAssign={(id) => onAgentChange?.(id)}
          />
        </Field>
      )}

      {showActions && <div className="border-t border-border-subtle" />}

      {onArchive && (
        <Field label="Archive">
          <button
            type="button"
            onClick={onArchive}
            className={`w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-small border transition-colors ${
              confirmArchive
                ? 'bg-warning/20 text-warning border-warning/30'
                : 'bg-surface-2 text-text-muted hover:text-warning hover:bg-warning/10 border-border-subtle'
            }`}
          >
            <Archive size={11} />
            {confirmArchive ? 'Confirm' : 'Archive'}
          </button>
        </Field>
      )}

      {onDelete && (
        <Field label="Delete">
          <button
            type="button"
            onClick={onDelete}
            className={`w-full flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-small border transition-colors ${
              confirmDelete
                ? 'bg-danger/20 text-danger border-danger/30'
                : 'bg-surface-2 text-text-muted hover:text-danger hover:bg-danger/10 border-border-subtle'
            }`}
          >
            <Trash2 size={11} />
            {confirmDelete ? 'Confirm' : 'Delete'}
          </button>
        </Field>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-micro font-medium uppercase tracking-wide text-text-muted/70">{label}</span>
      {children}
    </div>
  )
}
