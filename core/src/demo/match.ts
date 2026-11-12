/**
 * Choosing what the demo says and runs. Pure and deterministic: the same message and scripts give the same answer.
 */
import type { DemoIntent, DemoLeadScript, DemoRunScript, DemoSpokenLine } from './scripts.js'

/** The lowest overlap score (Dice coefficient of the words) at which a message counts as an intent. */
export const DEMO_MATCH_THRESHOLD = 0.4

/** The higher bar for a message made only of stop words, whose few words are shared by many phrasings. */
const STOP_WORDS_ONLY_THRESHOLD = 0.75

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'can', 'could', 'did', 'do', 'does',
  'for', 'from', 'get', 'have', 'hello', 'hey', 'hi', 'how', 'i', 'im', 'in', 'into', 'is', 'it', 'its', 'just', 'me',
  'my', 'now', 'of', 'on', 'or', 'our', 'please', 'so', 'some', 'that', 'the', 'their', 'them', 'there', 'these',
  'this', 'those', 'to', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with',
  'would', 'you', 'your',
])

/** Folds a plain plural (`tasks`) to its singular, leaving words such as `status` and `class` alone. */
function fold(word: string): string {
  return word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word
}

const TASK_KEY = /\b[\p{L}]{1,10}-\d+\b/gu

/**
 * A message's words as the matcher compares them: lower case, no punctuation, plurals folded, a task key such as
 * `WEB-3` kept whole, and stop words dropped unless `keepStopWords`.
 */
export function demoWords(text: string, keepStopWords = false): string[] {
  const out: string[] = []
  const lower = text.toLowerCase()
  for (const key of lower.match(TASK_KEY) ?? []) if (!out.includes(key)) out.push(key)
  for (const raw of lower.replace(TASK_KEY, ' ').split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || (!keepStopWords && STOP_WORDS.has(raw))) continue
    const word = fold(raw)
    if (!out.includes(word)) out.push(word)
  }
  return out
}

function normalised(text: string): string {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const shared = a.filter(w => b.includes(w)).length
  return (2 * shared) / (a.length + b.length)
}

/**
 * The intent with a phrasing equal to the message, else the one whose phrasings share the most words with it, or null
 * below `DEMO_MATCH_THRESHOLD`, when the agent answers with its fallback. A message made only of stop words ("What can
 * you do?") is compared with its stop words kept. On a tie the intent listed first wins.
 */
export function matchDemoIntent(message: string, intents: readonly DemoIntent[]): DemoIntent | null {
  const whole = normalised(message)
  const exact = intents.find(i => i.phrasings.some(p => normalised(p) === whole))
  if (exact) return exact
  const keep = demoWords(message).length === 0
  const words = demoWords(message, keep)
  let best: DemoIntent | null = null
  let bestScore = 0
  for (const intent of intents) {
    for (const phrasing of intent.phrasings) {
      const score = overlap(words, demoWords(phrasing, keep))
      if (score > bestScore) {
        best = intent
        bestScore = score
      }
    }
  }
  return bestScore >= (keep ? STOP_WORDS_ONLY_THRESHOLD : DEMO_MATCH_THRESHOLD) ? best : null
}

/** The run script for a run: its task's own, then its task type's, then the agent's default; null when none. */
export function pickDemoRunScript(
  runs: readonly DemoRunScript[],
  run: { taskKey?: string | null; taskType?: string | null },
): DemoRunScript | null {
  const of = (test: (s: DemoRunScript) => boolean) => runs.find(test) ?? null
  return (
    (run.taskKey ? of(s => 'task' in s.for && s.for.task === run.taskKey) : null) ??
    (run.taskType ? of(s => 'taskType' in s.for && s.for.taskType === run.taskType) : null) ??
    of(s => 'default' in s.for)
  )
}

/**
 * The lead's own closing line that a message in the thread says, so the demo voice can speak it from its clip: the
 * line equal to the message, or the refused line that opens it (the refusal's own words follow, unspoken). Null for
 * any other message.
 */
export function demoClosingLineOf(lead: Pick<DemoLeadScript, 'spoken'>, message: string): DemoSpokenLine | null {
  const text = message.trim()
  const { refused, ...whole } = lead.spoken
  const same = Object.values(whole).find(line => line.text.trim() === text)
  if (same) return same
  return text.startsWith(refused.text.trim()) ? refused : null
}
