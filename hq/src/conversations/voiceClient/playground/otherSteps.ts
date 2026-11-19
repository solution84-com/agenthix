/**
 * The Log's steps besides the light model's, pure: SOUND ending the person's turn, a typed message (YOU), HEAVY's
 * reply and recap, BACKCHANNEL's hums, and SYSTEM's notices and errors. A turn the light model closed alone is no HEAVY reply: its words
 * are the closing line, already its own step.
 */
import type { PlaygroundEntry, PlaygroundUsage } from '../../../shared/voicePlayground'
import type { LightRecapRow } from '../../../shared/voicePlaygroundLight'
import type { DecisionRow } from './decisions'
import { opening, secs, type LogNote, type LogStep } from './logModel'
import type { PageTrail, SoundEnd } from './pageTrail'

export const callWords = (model: string, u: Pick<PlaygroundUsage, 'inputTokens' | 'outputTokens'>) =>
  `${model} · ${u.inputTokens.toLocaleString()} tokens in, ${u.outputTokens.toLocaleString()} out`

function soundTitle(s: SoundEnd): string {
  if (s.by === 'cap') return 'no verdict: your words stood still to the pause limit'
  const quiet = s.silenceMs === null ? '' : `, after ${secs(s.silenceMs)} of quiet`
  if (s.by === 'fallback' || s.confidence === null) return `the sound model could not answer: its fallback ended the turn${quiet}`
  if (s.atLimit && s.silenceMs !== null) return `not sure (${Math.round(s.confidence * 100)}%): its ${Math.round(s.silenceMs / 1000)} s pause limit ended it`
  return `${Math.round(s.confidence * 100)}% sure${quiet}`
}

/** What set the wait READY waited for. */
const waitWhy = (s: SoundEnd) => {
  const by = [s.paced && 'your pace', s.patient && 'your “let me finish”'].filter(Boolean).join(' and ')
  return by ? `set by ${by}` : 'after false finishes'
}

function soundDetail(s: SoundEnd): string {
  const f = s.falseFinish
  return [
    s.waitedMs !== undefined && `waited for ${secs(s.waitedMs)} of quiet, ${waitWhy(s)}`,
    s.notFinished > 0 && `${s.notFinished} not-finished before this`,
    f && `a false finish: you went on ${secs(f.afterMs)} after it (${f.count} this turn); READY now waits for ${secs(f.waitMs)} of quiet`,
  ].filter(Boolean).join(' · ')
}

export function soundSteps(trail: PageTrail): LogStep[] {
  return trail.sounds.map((s, i) => {
    const detail = soundDetail(s)
    return {
      id: `sound-${i}-${s.at}`, at: s.at, actor: 'SOUND', tag: 'finished', title: soundTitle(s), stoppedAt: s.stoppedAt,
      ...(detail && { detail }), ...(s.falseFinish && { attrs: { 'false-finish': String(s.falseFinish.count), 'wait-ms': String(s.falseFinish.waitMs) } }),
    }
  })
}

/** A typed message is a YOU step of its own; a spoken one too when the page holds none of your words as they grew. */
export function typedSteps(entries: readonly PlaygroundEntry[], spokenToo = false): LogStep[] {
  return entries.filter(e => e.role === 'person' && (!e.spoken || spokenToo))
    .map(e => ({ id: `typed-${e.id}`, at: e.at, actor: 'YOU', tag: 'said', typed: true, title: `“${e.text}”`, detail: e.spoken ? 'spoken' : 'typed' }))
}

/** The turns the light model closed alone: their agent message is its closing line. */
function closedTurns(entries: readonly PlaygroundEntry[], trail: PageTrail): Set<string> {
  const ids = new Set(trail.answers.flatMap(a => (a.turn === 'closed' && a.turnId ? [a.turnId] : [])))
  for (const e of entries) {
    if (e.role === 'agent' && e.turnId && e.firstTextAt === e.at && entries.some(p => p.role === 'person' && p.turnId === e.turnId && p.at === e.at)) ids.add(e.turnId)
  }
  return ids
}

/** The reply without the lines heard before it, which its agent message starts with. */
function withoutLines(text: string, lines: readonly string[]): string {
  let rest = text.trim()
  for (let found = true; found;) {
    found = false
    for (const line of lines) {
      if (line && rest.startsWith(line)) { rest = rest.slice(line.length).trim(); found = true }
    }
  }
  return rest
}

export function heavySteps(
  entries: readonly PlaygroundEntry[], rows: readonly DecisionRow[], calls: readonly PlaygroundUsage[], recaps: readonly LightRecapRow[],
  trail: PageTrail, labelOf: (model: string) => string,
): LogStep[] {
  const closed = closedTurns(entries, trail)
  const lines = trail.plays.map(p => p.text)
  const steps: LogStep[] = []
  for (const e of entries) {
    if (e.role !== 'agent' || e.sound || !e.turnId || closed.has(e.turnId)) continue
    const call = calls.find(c => c.turnId === e.turnId)
    const row = rows.find(r => r.turnId === e.turnId)
    const decided = row?.outcome
    const text = withoutLines(e.text, lines)
    const failed = e.state === 'FAILED'
    const title = row?.held ? `held, kept listening${row.detail ? ` · “${row.detail}”` : ''}`
      : e.withdrawn ? 'not heard: you went on, so it was replaced'
      : failed ? `failed${e.error ? `: ${e.error}` : ''}`
      : text ? `“${opening(text)}”` : e.state === 'RUNNING' ? 'writing…' : 'no words'
    steps.push({
      id: `reply-${e.id}`, at: e.firstTextAt ?? e.at, actor: 'HEAVY', tag: 'reply', title, sinceEnd: true,
      detail: [call && callWords(labelOf(call.model), call), e.interrupted && 'you cut in: the part you heard',
        decided && decided !== 'Plain reply' && decided !== 'Thinking…' && !e.withdrawn && decided, row?.held && row.gap,
        row?.tone && `tone: ${row.tone}`].filter(Boolean).join(' · ') || undefined,
      ...(failed && { error: true }), ...(e.withdrawn && { withdrawn: true }),
      ...(!e.withdrawn && (e.firstTextAt !== undefined || e.state !== 'RUNNING') && { answers: true }),
      ...(!e.withdrawn && e.firstTextAt !== undefined && { heard: true }),
      attrs: { turn: e.turnId },
    })
  }
  for (const r of recaps) {
    steps.push({
      id: `recap-${r.id}`, at: r.at, actor: 'HEAVY', tag: 'recap', title: r.text ? `“${r.text}”` : r.error ?? 'No recap',
      detail: r.text ? `${r.text.split(/\s+/).length} words · ${secs(r.ms)}` : secs(r.ms), attrs: { written: r.text ? 'true' : 'false' },
    })
  }
  return steps
}

/** The id of the hum service's answer at `at`, which a hum's `from` names. */
const answerId = (at: number) => `hum-answer-${at}`

/**
 * The backchannel's sounds: in the turn's card, each with its kind, tone and the word picked, whether it was made new
 * or already made for the voice, the listening read's answer it came from, and why it came, or why nothing played; its near misses, each pause with no hum and the rule that held it back; and the hum service's answers,
 * the last two folded on the card. Never a check, so rule 2 does not apply.
 */
export function backchannelSteps(trail: PageTrail): LogStep[] {
  const hums = trail.hums.map((h): LogStep => ({
    id: `hum-${h.at}`, at: h.at, actor: 'BACKCHANNEL', tag: 'hum',
    title: h.text === null ? `${h.kind} · ${h.tone} · no hum played: ${h.why ?? 'none stored'}`
      : `${h.kind} · ${h.tone} · “${h.text}” · ${h.made === 'new' ? 'made new' : 'already made'}`,
    detail: [h.fromMs !== undefined && `its call took ${secs(h.fromMs, 2)}`, h.fallback && `stood in: ${h.fallback}`,
      `paused ${secs(h.pausedMs)}`,
      h.notYet ? 'the light model kept your turn open' : h.inWait ? 'READY, held by the false-finish wait' : `not finished (${h.verdict})`,
      `${secs(h.speechMs, 0)} of your speech since the agent's last sound${h.reactionSpacing ? ', enough for a reaction' : ''}`,
      h.reactionHeld && 'the reaction held over a plainer answer since', h.laugh && 'a laugh back: your voice laughed'].filter(Boolean).join(' · '),
    ...(h.fromAt !== undefined && { from: answerId(h.fromAt), fromWords: "the hum service's answer" }),
    attrs: { played: String(h.text !== null), kind: h.kind, tone: h.tone },
  }))
  const answers = trail.humAnswers.map((a): LogStep => ({
    id: answerId(a.at), at: a.at, actor: 'BACKCHANNEL', tag: 'service',
    title: a.dropped ? `${a.kind ?? 'no kind'}${a.tone ? ` ${a.tone}` : ''}, dropped: it came ${secs(a.waitedMs ?? a.ms, 2)} after its question`
      : a.fallback ? `no answer: the call ${a.fallback === 'timeout' ? 'ran out of time' : a.fallback === 'off' ? 'has no model here' : 'failed'}; the last stands`
        : `${a.kind}${a.tone ? ` ${a.tone}` : ''}`,
    detail: `call ${secs(a.ms, 2)}${a.skipped ? ` · ${a.skipped} s skipped while it was asked` : ''}${a.atPause ? ' · asked as the pause began' : ''}`,
    service: { kind: a.kind, tone: a.tone, ms: a.ms, skipped: a.skipped, dropped: a.dropped === true, ...(a.atPause && { atPause: true }) },
  }))
  const misses = trail.misses.map((m, i): LogStep => ({
    id: `miss-${i}-${m.at}`, at: m.at, actor: 'BACKCHANNEL', tag: 'no hum', title: m.why, nearMiss: true,
    ...(m.pausedMs !== null && { detail: `paused ${secs(m.pausedMs)}` }),
  }))
  return [...misses, ...answers, ...hums].sort((a, b) => a.at - b.at)
}

export function noteSteps(notes: readonly LogNote[]): LogStep[] {
  return notes.map(n => ({
    id: n.id, at: n.at, actor: 'SYSTEM', tag: n.kind, title: n.title, ...(n.detail && { detail: n.detail }), ...(n.kind === 'error' && { error: true }),
  }))
}
