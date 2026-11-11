import { useState, type ReactNode } from 'react'
import { Check, Copy, Gauge, ArrowUpRight } from 'lucide-react'
import { formatCo2, formatCost, formatEnergy, formatTokens, tokensToCo2Grams, tokensToKwh } from '../agents/aiMetrics'
import { copyText } from '../primitives/copyText'
import { DISABLED, FOCUS_RING } from '../primitives/controlStyles'
import { FloatingPanel, PanelFact } from './FloatingPanel'
import type { TranscriptEntry } from './types'

// An icon under a reply: muted, one step and ink on hover, one more pressed, the ring from the keyboard.
export const REPLY_ICON_BUTTON = `rounded-lg p-1 text-text-muted transition-colors not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED} max-lg:flex max-lg:h-11 max-lg:w-11 max-lg:items-center max-lg:justify-center`
const ICON_BUTTON = REPLY_ICON_BUTTON

export function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void copyText(text).then(ok => {
      setCopied(ok)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button type="button" onClick={copy} title="Copy" aria-label="Copy" className={ICON_BUTTON}>
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  )
}

/** Tokens, estimated cost, energy and CO₂ of a reply's run (or, with a note of its own, a conversation). */
export function UsageFacts({ usage, model }: { usage: NonNullable<TranscriptEntry['usage']>; model?: string | null }) {
  const total = usage.totalTokens
  const cost = formatCost(usage, model)
  return (
    <>
      <PanelFact label="Tokens">{formatTokens(total)}</PanelFact>
      <PanelFact label="Estimated cost">{cost === '—' ? 'not known for this model' : `about ${cost.replace('~', '')}`}</PanelFact>
      <PanelFact label="Energy">about {formatEnergy(tokensToKwh(total))}</PanelFact>
      <PanelFact label="CO₂">about {formatCo2(tokensToCo2Grams(total))}</PanelFact>
      <p className="pt-1 text-micro text-text-muted">Energy and CO₂ are a flat estimate per token.</p>
    </>
  )
}

/** Under a reply: Copy, Usage (a popup over the conversation) and Details (the run's page), quiet and always visible. */
export function ReplyActions({ text, usage, model, runId, onOpenRun }: {
  text: string
  usage: TranscriptEntry['usage']
  model?: string | null
  runId: string | null
  onOpenRun?: (runId: string) => void
}) {
  const [open, setOpen] = useState<'up' | 'down' | null>(null)
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) return setOpen(null)
    setOpen(e.currentTarget.getBoundingClientRect().top > 300 ? 'up' : 'down')
  }
  let usageButton: ReactNode = null
  if (usage) {
    usageButton = (
      <div className="relative">
        <button type="button" data-panel-trigger onClick={toggle} title="Usage" aria-label="Usage" aria-expanded={!!open} className={ICON_BUTTON}>
          <Gauge size={14} />
        </button>
        {open && (
          <FloatingPanel title="Usage · this reply" onClose={() => setOpen(null)} placement={open === 'up' ? 'lg:left-0 lg:bottom-full lg:mb-1' : 'lg:left-0 lg:top-full lg:mt-1'}>
            <UsageFacts usage={usage} model={model} />
          </FloatingPanel>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 pt-0.5">
      <CopyIconButton text={text} />
      {usageButton}
      {runId && onOpenRun && (
        <button type="button" onClick={() => onOpenRun(runId)} title="Details" aria-label="Details" className={ICON_BUTTON}>
          <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  )
}
