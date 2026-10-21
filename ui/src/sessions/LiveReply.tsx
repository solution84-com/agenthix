import { Loader2 } from 'lucide-react'
import { ReplyFrame } from './ReplyBlock'
import { WorkLineFold, type WorkLineActions } from './WorkLineFold'
import { defaultRenderMarkdown, type LiveToolCall, type RenderMarkdown, type TranscriptEntry } from './types'

const live = (id: string, rest: Partial<TranscriptEntry>): TranscriptEntry => ({
  id, role: 'TOOL', content: '', thought: null, thinkingDurationMs: null, toolName: null, toolInput: null, toolOutput: null,
  model: null, createdAt: new Date().toISOString(), usage: null, ...rest,
})

/** The reply being written: what the agent is doing as a growing work line, then the text as it streams in. */
export function LiveReply({ agentName, avatarUrl, toolCalls, thought, thoughtAt, streamed, workingSecs, notice, summarising, actions, renderMarkdown }: {
  agentName: string
  avatarUrl?: string | null
  toolCalls: LiveToolCall[]
  thought: string
  thoughtAt: string | null
  streamed: string
  workingSecs: number
  notice: string | null
  summarising: boolean
  actions: WorkLineActions
  renderMarkdown?: RenderMarkdown
}) {
  const md = renderMarkdown ?? defaultRenderMarkdown
  const entries = [
    ...toolCalls.map(c => live(c.toolUseId, { toolName: c.toolName, toolInput: c.toolInput, toolOutput: c.output ?? null, createdAt: c.at ?? new Date().toISOString() })),
    ...(thought ? [live('live-thought', { role: 'SYSTEM', kind: 'THOUGHT', content: thought, createdAt: thoughtAt ?? new Date().toISOString() })] : []),
  ]
  const running = toolCalls.some(c => c.status === 'running')
  return (
    <ReplyFrame agentName={agentName} avatarUrl={avatarUrl} meta={`Working${workingSecs > 0 ? ` · ${workingSecs}s` : ''}`}>
      {summarising && <p className="flex items-center gap-1.5 text-small text-text-secondary"><Loader2 size={12} className="animate-spin" /> Summarising older messages…</p>}
      <WorkLineFold entries={entries} runId={null} actions={actions} live={running || !streamed} />
      {notice && <p role="status" className="text-small text-warning">{notice}</p>}
      {entries.length === 0 && !streamed && !summarising && (
        <div className="flex h-6 items-center gap-1.5" aria-label="Working">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0.3s]" />
        </div>
      )}
      {streamed && (
        <div className="max-w-[720px] text-reading">
          {md({ content: streamed })}
          <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-accent align-text-bottom" />
        </div>
      )}
    </ReplyFrame>
  )
}
