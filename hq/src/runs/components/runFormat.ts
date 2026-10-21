/** How the Runs screen words a run's numbers and a tool call's text. Pure. */
import { formatCost, formatEnergy, formatTokens, MODEL_PRICING, tokensToKwh } from '../../shared/utils/aiMetrics'
import type { TokenUsage } from '@agenthix/core'

/** "6 min", "1 h 5 min", "42 s": how long a run took; null until it has both ends. */
export function durationText(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null
  const seconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return minutes % 60 === 0 ? `${h} h` : `${h} h ${minutes % 60} min`
}

/** "09:06" — a clock time. */
export function clockText(at: string): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** "9 Oct 09:06 – 09:12, 6 min" or "9 Oct 09:06 – 3 Oct 10:00" when it spans days. */
export function timesText(startedAt: string | null, endedAt: string | null, createdAt: string): string {
  const start = startedAt ?? createdAt
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const head = `${day(start)} ${clockText(start)}`
  if (!endedAt) return startedAt ? `${head}, going now` : `${head}, not started`
  const sameDay = day(start) === day(endedAt)
  const tail = sameDay ? clockText(endedAt) : `${day(endedAt)} ${clockText(endedAt)}`
  const length = durationText(startedAt, endedAt)
  return `${head} – ${tail}${length ? `, ${length}` : ''}`
}

/** "182k in · 9k out · about $0.71 · 0.4 kWh", the cost and energy as the reply's usage line works them out. */
export function usageText(usage: TokenUsage | null, model: string): string | null {
  if (!usage) return null
  const parts = [`${formatTokens(usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0))} in`, `${formatTokens(usage.outputTokens)} out`]
  if (MODEL_PRICING[model]) parts.push(formatCost(usage, model))
  parts.push(formatEnergy(tokensToKwh(usage.totalTokens)))
  return parts.join(' · ')
}

export const OUTPUT_PREVIEW_LINES = 8

/** A call's output cut to its first lines; `total` is the whole line count, and `cut` says whether anything was left out. */
export function outputPreview(output: string, limit = OUTPUT_PREVIEW_LINES): { text: string; total: number; cut: boolean } {
  const lines = output.split('\n')
  const total = output.endsWith('\n') ? lines.length - 1 : lines.length
  return lines.length > limit ? { text: lines.slice(0, limit).join('\n'), total, cut: true } : { text: output, total, cut: false }
}

export type ApprovalGiven = { tools: string[]; bashPatterns: string[]; by: string | null; at: string | null }

/** Whether a call used what an earlier run asked for and a person approved for this one: its tool, or a command its pattern covers. */
export function askedFirst(call: { toolName: string; toolInput: unknown; blocked: boolean }, given: ApprovalGiven | null): boolean {
  if (!given || call.blocked) return false
  if (given.tools.includes(call.toolName)) return true
  const command = (call.toolInput as { command?: unknown } | null)?.command
  return typeof command === 'string' && given.bashPatterns.some((p) => command.startsWith(p.replace(/\*+$/, '').trimEnd()))
}

/** What a call was, in one line: the command for a shell call, else its first argument. */
export function callSummary(toolName: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  const first = typeof args.command === 'string' ? args.command
    : typeof args.file_path === 'string' ? args.file_path
      : typeof args.path === 'string' ? args.path
        : typeof args.url === 'string' ? args.url
          : typeof args.pattern === 'string' ? args.pattern
            : null
  return first ? `${toolName} ${first.split('\n')[0]}` : toolName
}
