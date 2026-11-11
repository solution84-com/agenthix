import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, useAction } from 'wasp/client/operations'
import { getAgentChatStats, stopAgent } from 'wasp/client/operations'
import { useAttentionWhen } from '@agenthix/ui/attention'
import { AlertCircle, Loader2, Square, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  agentId: string
}

export function AgentControlsBar({ agentId }: Props) {
  const { data: stats } = useQuery(getAgentChatStats, { agentId })
  const stopAgentFn = useAction(stopAgent)

  const [stopBusy, setStopBusy] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stopFailed, setStopFailed] = useState<string | null>(null)
  const stopFailure = useAttentionWhen(stopFailed, { kind: 'alert', title: 'The runs were not stopped', onClose: () => setStopFailed(null) })

  if (!stats) return null

  const stop = async () => {
    if (stopBusy) return
    setStopBusy(true)
    setStopFailed(null)
    try { await stopAgentFn({ id: agentId }) } catch (e) {
      setStopFailed(e instanceof Error && e.message ? e.message : 'Stop all did not go through. Nothing was stopped.')
    } finally { setStopBusy(false) }
  }

  const totalActive = stats.queuedCount + stats.runningCount + stats.blockedCount

  return (
    <div className="border-b border-border shrink-0 bg-surface-1">
      {stopFailure}
      {/* Main row */}
      <div className="px-3 py-1.5 flex items-center gap-2">
        {/* Stats toggle */}
        <button
          onClick={() => setShowStats(s => !s)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro transition-colors cursor-pointer ${FOCUS_RING} ${
            showStats
              ? 'bg-selected text-text-primary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed'
          }`}
          title={showStats ? 'Hide stats' : 'Show stats'}
        >
          <BarChart2 size={11} />
          {totalActive > 0 && !showStats && (
            <span className="bg-warning/20 text-warning/90 rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center text-micro font-medium">
              {totalActive}
            </span>
          )}
          {showStats ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
        </button>

        {/* Stop all */}
        <div className="ml-auto">
          <button
            onClick={stop}
            disabled={stopBusy || stats.runningCount === 0}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro text-danger transition-colors cursor-pointer not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
            title={stats.runningCount === 0 ? 'No active runs' : 'Cancel all active runs'}
          >
            {stopBusy ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} className="fill-current" />}
            {stopBusy ? 'Stopping…' : 'Stop all'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {showStats && (
        <div className="px-3 pb-1.5 flex items-center gap-3 flex-wrap border-t border-border-subtle pt-1.5">
          {/* Queued */}
          <span className={`flex items-center gap-1 text-micro tabular-nums ${
            stats.queuedCount > 0 ? 'text-warning/70' : 'text-text-muted/70'
          }`}>
            {stats.queuedCount > 0 && (
              <span className="bg-warning/20 text-warning/90 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-micro font-medium">
                {stats.queuedCount}
              </span>
            )}
            {stats.queuedCount === 1 ? '1 queued' : `${stats.queuedCount} queued`}
          </span>

          {/* Running */}
          {stats.runningCount > 0 && (
            <span className="flex items-center gap-1 text-micro text-text-secondary">
              <Loader2 size={10} className="animate-spin" />
              {stats.runningCount} running
            </span>
          )}

          {/* Blocked */}
          {stats.blockedCount > 0 && (
            <span className="flex items-center gap-1 text-micro text-danger/70">
              <AlertCircle size={10} />
              {stats.blockedCount} blocked
            </span>
          )}
        </div>
      )}
    </div>
  )
}
