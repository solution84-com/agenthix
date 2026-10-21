import type { ContextUse } from '@agenthix/core'
import { FloatingPanel, PanelFact } from './FloatingPanel'
import { UsageFacts } from './ReplyActions'
import { MemoryRow } from './MemoryBar'
import { formatTime } from './SessionComponents'

export type ConversationPopupProps = {
  startedAt: string | Date | undefined
  model: string
  modelId: string | null
  replies: number
  failed: number
  total: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number }
  contextUse: ContextUse | null
  agentWorking: boolean
  summarising: boolean
  onSummarise?: () => void
  onOpenRuns?: () => void
  onClose: () => void
}

function startedText(value: string | Date | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `Today ${formatTime(d)}`
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  return `${day} ${formatTime(d)}`
}

/** The conversation's total: when it started, the model, replies, usage and the agent's memory. A sheet on a phone. */
export function ConversationPopup(p: ConversationPopupProps) {
  return (
    <FloatingPanel title="Usage · this conversation" onClose={p.onClose} placement="lg:right-3 lg:top-2">
      <div className="max-h-[70vh] divide-y divide-border-subtle overflow-y-auto">
        <PanelFact label="Started">{startedText(p.startedAt)}, by you</PanelFact>
        <PanelFact label="Model">{p.model}</PanelFact>
        <PanelFact label="Replies">{p.replies}{p.failed > 0 && ` · ${p.failed} failed`}</PanelFact>
        <div className="py-1.5">
          <p className="text-micro text-text-muted">Usage</p>
          {p.total.totalTokens > 0 ? <UsageFacts usage={p.total} model={p.modelId} /> : <p className="text-small text-text-muted">None yet</p>}
        </div>
        <div className="py-1.5">
          <p className="mb-1 text-micro text-text-muted">Agent's memory</p>
          <MemoryRow use={p.contextUse} agentWorking={p.agentWorking} summarising={p.summarising} onSummarise={p.onSummarise} />
        </div>
        {p.onOpenRuns && (
          <div className="py-1.5">
            <button type="button" onClick={p.onOpenRuns} className="text-small text-accent hover:underline max-lg:min-h-10">This conversation's runs ›</button>
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}
