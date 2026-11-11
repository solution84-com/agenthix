import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'
import { REPLY_ICON_BUTTON, UsageFacts } from './ReplyActions'
import { OPENS_MENU } from '../primitives/Menus'

export type SessionUsageTotals = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number }

/** A header icon that opens the session's total usage in a popup (a sheet on a phone), in place of a line always on screen. */
export function SessionUsageButton({ total, model }: { total: SessionUsageTotals; model?: string | null }) {
  const [open, setOpen] = useState(false)
  if (total.totalTokens <= 0) return null
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-panel-trigger
        onClick={() => setOpen(v => !v)}
        title="Usage"
        aria-label="Usage"
        aria-expanded={open}
        className={`${REPLY_ICON_BUTTON} ${OPENS_MENU}`}
      >
        <Gauge size={15} />
      </button>
      {open && (
        <FloatingPanel title="Usage · this session" onClose={() => setOpen(false)} placement="lg:right-0 lg:top-full lg:mt-1">
          <UsageFacts usage={total} model={model} />
        </FloatingPanel>
      )}
    </div>
  )
}

export function sessionTotals(s: { totalInputTokens?: number; totalOutputTokens?: number; totalCacheReadTokens?: number; totalCacheWriteTokens?: number } | null | undefined): SessionUsageTotals {
  const inputTokens = s?.totalInputTokens ?? 0
  const outputTokens = s?.totalOutputTokens ?? 0
  const cacheReadTokens = s?.totalCacheReadTokens ?? 0
  const cacheWriteTokens = s?.totalCacheWriteTokens ?? 0
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens }
}
