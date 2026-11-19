/**
 * A card's one line of the hum service's answers (spec §The backchannel, the Log): how many, the kinds and tones over
 * the turn, the median and slowest call, the seconds skipped while a question was in flight, the answers dropped, and
 * how many were asked as a pause began.
 */
import { secs, type LogStep } from './logModel'

export function serviceLine(steps: readonly Pick<LogStep, 'service'>[]): string | null {
  const answers = steps.flatMap(s => (s.service ? [s.service] : []))
  if (answers.length === 0) return null
  const counts = new Map<string, number>()
  for (const a of answers.filter(a => !a.dropped)) {
    const name = a.kind === null ? 'continuer calm (failed)' : a.tone ? `${a.kind} ${a.tone}` : a.kind
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const ms = answers.map(a => a.ms).sort((a, b) => a - b)
  const median = ms.length % 2 ? ms[(ms.length - 1) / 2]! : (ms[ms.length / 2 - 1]! + ms[ms.length / 2]!) / 2
  const skipped = answers.reduce((n, a) => n + a.skipped, 0)
  const dropped = answers.filter(a => a.dropped).length
  const atPause = answers.filter(a => a.atPause).length
  const kinds = [...counts].map(([name, n]) => `${name} ×${n}`).join(', ')
  return [
    `${answers.length} hum service ${answers.length === 1 ? 'answer' : 'answers'}${kinds ? `: ${kinds}` : ''}`,
    `median ${secs(median, 2)}`, `slowest ${secs(ms.at(-1)!, 2)}`,
    skipped ? `${skipped} skipped` : 'none skipped', ...(dropped ? [`${dropped} dropped`] : []),
    ...(atPause ? [`${atPause} asked as a pause began`] : []),
  ].join(' · ')
}
