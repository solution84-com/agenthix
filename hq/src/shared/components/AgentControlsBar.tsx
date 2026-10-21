import { useState } from 'react'
import { useQuery, useAction } from 'wasp/client/operations'
import { getAgentChatStats, stopAgent } from 'wasp/client/operations'
import { AlertCircle, Loader2, Square, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  agentId: string
}

export function AgentControlsBar({ agentId }: Props) {
  const { data: stats } = useQuery(getAgentChatStats, { agentId })
  const stopAgentFn = useAction(stopAgent)

  const [stopBusy, setStopBusy] = useState(false)
  const [showStats, setShowStats] = useState(false)

  if (!stats) return null

  const stop = async () => {
    if (stopBusy) return
    setStopBusy(true)
    try { await stopAgentFn({ id: agentId }) } finally { setStopBusy(false) }
  }

  const totalActive = stats.queuedCount + stats.runningCount + stats.blockedCount

  return (
    <div className="border-b border-border shrink-0 bg-surface-1">
      {/* Main row */}
      <div className="px-3 py-1.5 flex items-center gap-2">
        {/* Stats toggle */}
        <button
          onClick={() => setShowStats(s => !s)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-micro transition-colors cursor-pointer ${
            showStats
              ? 'bg-surface-3 text-text-secondary'
              : 'bg-surface-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary'
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
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-micro text-danger/50 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed"
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
            <span className="flex items-center gap-1 text-micro text-accent/70">
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
