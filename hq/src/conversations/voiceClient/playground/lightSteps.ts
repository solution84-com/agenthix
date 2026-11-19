/**
 * The light model's steps for the Log, pure: a LIGHT step per check (why it was asked, then what it chose), a line per
 * line played (LIGHT's own words, or SYSTEM's stored hold phrase) with the decision it came from, and SYSTEM's own
 * steps: the fallback's hand over, and closing a turn kept open to the "not yet" limit. From the server's rows, with
 * the page's own events (`pageTrail.ts`) for when each check was asked and each line began.
 */
import type { VoiceListenAction } from '@agenthix/core'
import type { LightCallRow, LightLineRow, LightTurnRow } from '../../../shared/voicePlaygroundLight'
import type { ListenerToolName } from '../../voice/listener/tools'
import { secs, shortened, type LogStep } from './logModel'
import type { PageTrail, TrailAnswer } from './pageTrail'

/** How far the page's and the server's clocks may be apart when matching what each saw. */
const SKEW_MS = 1_000

const ACTION_WORDS: Record<ListenerToolName, string> = {
  keep_listening: 'keep listening', acknowledge: 'acknowledge', invite: 'invite you to go on',
  close_turn: 'close the turn itself', hand_over: 'hand over with a hold',
}

// A `hum` an older hq sent is no line kind of the light model's now: it shows as a plain line.
const LINE_KIND: Partial<Record<VoiceListenAction, string>> = {
  acknowledge: 'acknowledgement', invite: 'invitation', close_turn: 'closing line', hand_over: 'hold',
}

export function askedBecause(c: Pick<LightCallRow, 'moment' | 'keptOpen' | 'quietMs' | 'workingMs'>): string {
  switch (c.moment) {
    case 'limit': return `the ${Math.round(c.quietMs / 1000)} s limit was reached after an invitation nobody answered`
    // Only an older page asks after a pause in your words; the backchannel's hums ask nothing.
    case 'quietAfterWords': return `you paused ${secs(c.quietMs, 2)} (an older page's check)`
    case 'soundsFinished': return 'SOUND said finished'
    case 'quiet': return c.keptOpen ? `still quiet ${secs(c.quietMs)} after a “not yet”` : `still quiet ${secs(c.quietMs)}, at its next check`
    case 'working': return `the heavy model still working, ${secs(c.workingMs ?? c.quietMs)} in`
  }
}

function noAnswer(c: LightCallRow): string {
  if (c.superseded) return 'a newer check replaced it'
  if (c.overLimit) return 'still waiting at its time limit'
  return 'the call failed'
}

function callDetail(c: LightCallRow, dropped: string | null): string {
  return [
    dropped !== null && `its line was not played: ${dropped}`,
    c.choice === null && noAnswer(c),
    c.message.trim() && `heard “${shortened(c.message)}”`,
    c.asked !== null && `understood as “${c.asked}”`,
    c.answer !== null && `would have answered “${c.answer}” (not said)`,
    c.answerCut && 'answer cut to the word cap',
    c.dropped && `dropped: ${c.dropped}${c.droppedWords ? ` “${c.droppedWords}”` : ''}`,
    c.stale && 'a newer check had begun, so it decided nothing',
    c.nextCheck !== null && `hq checks again in ${Math.round(c.nextCheck * 10) / 10} s`,
    secs(c.ms, 2),
  ].filter(Boolean).join(' · ')
}

const sameCall = (c: LightCallRow, t: LightTurnRow) => t.seq === c.seq && Math.abs(t.at - c.at) <= SKEW_MS

function callStep(c: LightCallRow, trail: PageTrail, turns: readonly LightTurnRow[]): LogStep {
  // hq's own call at the limit was never asked by the page.
  const ask = c.moment === 'limit' ? undefined : trail.asks.findLast(a => a.call === c.seq && a.at <= c.at + SKEW_MS)
  const turn = turns.find(t => sameCall(c, t))
  const lineId = trail.answers.findLast(a => a.call === c.seq && a.lineId && Math.abs(a.at - c.at) <= SKEW_MS)?.lineId
  const drop = lineId ? trail.drops.find(d => d.lineId === lineId) : undefined
  const notYet = turn?.outcome === 'notYet'
  const tone = c.words && c.choice !== 'keep_listening' ? ` · ${c.tone ?? 'calm'}` : ''
  const action = c.choice === null ? '' : ` → ${notYet ? 'not yet: keep the turn open' : ACTION_WORDS[c.choice]}${c.words ? ` “${c.words}”` : ''}${tone}`
  const ends = turn?.outcome === 'handedOver' ? 'handedOver' as const
    : turn?.outcome === 'closed' ? (c.moment === 'limit' ? 'limit' as const : 'closed' as const) : undefined
  return {
    id: `light-${c.id}`, at: ask?.at ?? c.at - c.ms, actor: 'LIGHT', tag: c.choice ?? 'no answer', check: true,
    title: `Asked because ${askedBecause(c)}${action}`, detail: callDetail(c, drop?.why ?? null),
    ...(c.why && { why: c.why }), ...(c.withReason && { reasonOn: true }),
    ...(c.failed && { error: true }), ...(ends && { ends }), ...(notYet && { notYet }),
    ...(((c.moment === 'quiet' && c.keptOpen) || c.moment === 'limit') && { afterNotYet: true }),
    attrs: {
      seq: String(c.seq), moment: c.moment, choice: c.choice ?? 'none', ms: String(Math.round(c.ms)),
      ...(drop && { line: 'not played' }), ...(c.stale && { stale: 'true' }), ...(c.overLimit && { 'over-limit': 'true' }), ...(c.answer !== null && { answer: c.answer }),
    },
  }
}

function systemStep(t: LightTurnRow, calls: readonly LightCallRow[]): LogStep | null {
  const hold = t.say ? ` “${t.say}”` : ''
  if (t.outcome === 'off') {
    return { id: `system-${t.id}`, at: t.at, actor: 'SYSTEM', tag: 'hand_over', ends: 'off', title: 'No light model answered: handed over as plain voice' }
  }
  if (t.outcome === 'limitClosed') {
    return {
      id: `system-${t.id}`, at: t.at, actor: 'SYSTEM', tag: 'close', ends: 'limit', afterNotYet: true,
      title: `Kept open to the limit after an invitation nobody answered → closed with a stored closing line${hold}`,
    }
  }
  if (t.outcome !== 'fallback') return null
  if (calls.some(c => sameCall(c, t))) {
    return { id: `system-${t.id}`, at: t.at, actor: 'SYSTEM', tag: 'hand_over', ends: 'fallback', title: `No check answered in time → hand over with a stored hold${hold}` }
  }
  return {
    id: `system-${t.id}`, at: t.at, actor: 'SYSTEM', tag: 'close', ends: 'bound', afterNotYet: true,
    title: `Kept open to the limit after a “not yet” → hand over with a stored hold${hold}`,
  }
}

function lineStep(lineId: string, text: string, start: number, end: number | null, played: LightLineRow | undefined, answer: TrailAnswer | undefined, calls: readonly LightCallRow[]): LogStep {
  const stored = played?.stored ?? answer?.turn === 'fallback'
  const call = answer && calls.findLast(c => c.seq === answer.call && c.at <= answer.at + SKEW_MS)
  const kind = stored ? (answer?.action === 'close_turn' ? 'closing line' : 'hold') : (answer && LINE_KIND[answer.action]) ?? 'line'
  const how = played ? 'played to its end' : end !== null ? 'stopped before its end' : 'playing'
  return {
    id: `line-${lineId}`, at: start, actor: stored ? 'SYSTEM' : 'LIGHT', tag: 'line', heard: true,
    title: `${kind} · “${text}”`,
    detail: [stored ? 'a stored phrase, calm' : call && `tone: ${call.tone ?? 'calm'}`, how, end !== null && secs(end - start)].filter(Boolean).join(' · '),
    ...(stored ? { from: 'system' } : call ? { from: `light-${call.id}`, fromWords: `the ${call.choice ?? 'check'}` } : {}),
    attrs: { stored: String(stored) },
  }
}

export function lightSteps(
  calls: readonly LightCallRow[], turns: readonly LightTurnRow[], lines: readonly LightLineRow[], trail: PageTrail,
): LogStep[] {
  const steps: LogStep[] = calls.map(c => callStep(c, trail, turns))
  for (const t of turns) {
    const s = systemStep(t, calls)
    if (s) steps.push(s)
  }
  const answerOf = (lineId: string) => trail.answers.find(a => a.lineId === lineId)
  const seen = new Set<string>()
  for (const p of trail.plays) {
    if (seen.has(p.lineId)) continue
    seen.add(p.lineId)
    steps.push(lineStep(p.lineId, p.text, p.start, p.end, lines.find(l => l.lineId === p.lineId), answerOf(p.lineId), calls))
  }
  for (const l of lines) {
    if (!seen.has(l.lineId)) steps.push(lineStep(l.lineId, l.text, l.at, null, l, answerOf(l.lineId), calls))
  }
  return steps
}
