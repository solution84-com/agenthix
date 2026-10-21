import { X, ArrowLeft, Maximize2, Minimize2, FolderOpen, Box, ListTodo, Gauge } from 'lucide-react'
import { AgentAvatar } from './SessionComponents'
import type { SessionDetail } from './types'

export interface PanelChatHeaderProps {
  mode: 'panel' | 'full'
  loading: boolean
  connected: boolean
  agentName: string
  avatarUrl?: string | null
  title?: string | null
  primaryLocation?: SessionDetail['primaryLocation']
  onBack?: () => void
  onMaximizeToggle?: () => void
  onClose?: () => void
  /** Opens the conversation's total (its usage and the agent's memory). */
  onUsage?: () => void
}

/** The conversation's title bar, and the line saying where the agent is working. */
export function PanelChatHeader({
  mode, loading, connected, agentName, avatarUrl, title, primaryLocation, onBack, onMaximizeToggle, onClose, onUsage,
}: PanelChatHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
        {mode === 'panel' && onBack && (
          <button onClick={onBack} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <ArrowLeft size={16} />
          </button>
        )}
        {!loading && <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />}
        <span className="text-body font-semibold text-text-primary flex-1 truncate min-w-0">
          {title ? `${agentName}: ${title}` : agentName}
        </span>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-success' : 'bg-warning'}`} />
        {onUsage && (
          <button
            data-panel-trigger
            onClick={onUsage}
            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="This conversation's usage"
            aria-label="This conversation's usage"
          >
            <Gauge size={14} />
          </button>
        )}
        {onMaximizeToggle && (
          <button
            onClick={onMaximizeToggle}
            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title={mode === 'full' ? 'Restore panel' : 'Expand panel'}
          >
            {mode === 'full' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        {mode === 'panel' && (
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Working-context badge (ADR-0039 §8) — where this session's cwd is */}
      {primaryLocation && (() => {
        const pl = primaryLocation
        const Icon = pl.kind === 'workspace' ? Box : pl.kind === 'task' ? ListTodo : FolderOpen
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border-subtle bg-surface-1 shrink-0 text-micro text-text-muted">
            <Icon size={11} className="text-text-muted shrink-0" />
            <span className="truncate">
              Working in <span className="text-text-secondary font-medium">{pl.label}</span>
            </span>
          </div>
        )
      })()}
    </>
  )
}
