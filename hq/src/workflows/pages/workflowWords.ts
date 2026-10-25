/** Words for the Workflows screens (workflows spec part 5): a parameter's rule, durations, states, and who did what. */
import { WORKFLOW_LIMITS, type WorkflowParameter, type WorkflowRunState, type WorkflowStepState } from '@agenthix/core'

const CLASS_WORDS: Record<string, string> = { 'A-Za-z': 'letters', 'a-zA-Z': 'letters', 'a-z': 'lowercase letters', 'A-Z': 'capital letters', '0-9': 'digits' }

/** A bracket class such as `A-Za-z0-9._/-` in words, or null when it is not one this can say plainly. */
function classInWords(body: string): string | null {
  const words: string[] = []
  const marks: string[] = []
  let rest = body
  for (const range of Object.keys(CLASS_WORDS).sort((a, b) => b.length - a.length)) {
    while (rest.includes(range)) {
      words.push(CLASS_WORDS[range])
      rest = rest.replace(range, '')
    }
  }
  for (const ch of rest) {
    if (/[\\^\]]/.test(ch)) return null
    marks.push(ch === '-' ? '-' : ch)
  }
  const unique = [...new Set(words)]
  const named = unique.includes('letters') ? unique.filter((w) => w !== 'lowercase letters' && w !== 'capital letters') : unique
  return [...named, ...(marks.length ? [marks.join(' ')] : [])].join(', ')
}

/**
 * What a parameter accepts, in words. A pattern of the common form `[class]{m,n}` or `[class]+` is spelled out
 * (*Letters, digits, . _ / - · up to 100*); any other pattern is shown as it is.
 */
export function parameterRule(p: WorkflowParameter): string {
  if (p.kind === 'values') return `One of: ${p.values.join(', ')}`
  if (p.kind === 'text') return `Any text · up to ${WORKFLOW_LIMITS.textParameterValueMax.toLocaleString('en')} characters`
  const m = /^\[([^\]]+)\](\+|\*|\{(\d+)(?:,(\d*))?\})$/.exec(p.pattern)
  const words = m ? classInWords(m[1]) : null
  if (!m || !words) return `Must match ${p.pattern}`
  const text = words.charAt(0).toUpperCase() + words.slice(1)
  if (m[2] === '+') return text
  if (m[2] === '*') return text
  const min = Number(m[3])
  const max = m[4] === undefined ? min : m[4] === '' ? null : Number(m[4])
  if (max === null) return `${text} · at least ${min}`
  return `${text} · ${min > 1 && min !== max ? `${min} to ${max}` : `up to ${max}`}`
}

/** Whether a value passes a parameter's rule, so a run is refused on the page before anything is sent. */
export function parameterAccepts(p: WorkflowParameter, value: string): boolean {
  if (p.kind === 'values') return p.values.includes(value)
  if (p.kind === 'text') return value.length <= WORKFLOW_LIMITS.textParameterValueMax
  if (value.length === 0 || value.length > WORKFLOW_LIMITS.parameterValueMax) return false
  try {
    return new RegExp(`^(?:${p.pattern})$`, 'u').test(value)
  } catch {
    return false
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${s % 60} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function formatSeconds(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

export const STEP_MARK: Record<WorkflowStepState, string> = {
  waiting: '○', running: '●', passed: '✓', failed: '✕', skipped: '–', stopped: '■',
}

export const STEP_WORDS: Record<WorkflowStepState, string> = {
  waiting: 'Waiting', running: 'Running', passed: 'Passed', failed: 'Failed', skipped: 'Skipped', stopped: 'Stopped',
}

export const RUN_WORDS: Record<WorkflowRunState, string> = {
  waiting: 'Waiting', running: 'Running', passed: 'Passed', failed: 'Failed', stopped: 'Stopped',
}

export const RUN_ACTIVE: ReadonlySet<string> = new Set(['waiting', 'running'])

export const LEVEL_WORDS: Record<string, string> = { LOW: 'low risk', LOOK_CLOSELY: 'look closely', HIGH: 'high risk' }

export function levelWords(level: string | null | undefined): string {
  return level ? (LEVEL_WORDS[level] ?? 'unknown') : 'still reading it'
}

export function stepsWords(n: number): string {
  return n === 1 ? '1 step' : `${n} steps`
}

export function whenWords(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return ''
  const date = new Date(d)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(date)) / 86_400_000)
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `today ${time}`
  if (days === 1) return 'yesterday'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** ` in "<conversation title>"` for a version proposed in a conversation the reader may read; otherwise nothing. */
export function inConversationWords(proposedIn: { title: string | null } | null | undefined): string {
  return proposedIn ? ` in "${proposedIn.title?.trim() || 'a conversation'}"` : ''
}
