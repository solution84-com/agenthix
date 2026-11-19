/**
 * The Log's PACE steps, pure: the pace in force as the sound model ended each turn ("PACE 23 breaths · 9 in 10 under
 * 1.5 s → finish wait 1.7 s · hums up to 1.3 s"), and each change of listening style the reply set
 * (`set_listening_style`). Asides: they cut no stretch of your words.
 */
import type { Learned } from '../pacing/pace'
import { isNormal, styleWords } from '../pacing/style'
import { secs, type LogStep } from './logModel'
import type { PageTrail } from './pageTrail'

const share = (pct: number) => (pct % 10 === 0 ? `${pct / 10} in 10` : `${pct}%`)

export function paceTitle(heard: number, learned: Learned | null): string {
  const breaths = `${heard} breath${heard === 1 ? '' : 's'}`
  if (!learned) return `${breaths} · not learned yet: the fixed finish wait and hum window`
  return `${breaths} · ${share(learned.finishSharePct)} under ${secs(learned.finishShareMs)} → finish wait ${secs(learned.finishWaitMs)}`
    + ` · hums up to ${secs(learned.latestPauseMs)}`
}

export function paceSteps(trail: PageTrail): LogStep[] {
  const paces = trail.paces.map((p, i): LogStep => ({
    id: `pace-${i}-${p.at}`, at: p.at, actor: 'PACE', tag: 'pace', aside: true, title: paceTitle(p.heard, p.learned),
    ...(!isNormal(p.style) && { detail: `style: ${styleWords(p.style)}` }),
    attrs: { breaths: String(p.heard), learned: String(p.learned !== null), ...(p.learned && { 'wait-ms': String(p.learned.finishWaitMs), 'hums-ms': String(p.learned.latestPauseMs) }) },
  }))
  const styles = trail.styles.map((s, i): LogStep => ({
    id: `style-${i}-${s.at}`, at: s.at, actor: 'PACE', tag: 'style', aside: true,
    title: s.restored ? `${styleWords(s.state)}, held from earlier in this conversation` : `${s.asked ?? 'style'} → ${styleWords(s.state)}`,
    ...(!s.restored && { detail: 'set by the reply' }),
    attrs: { hums: s.state.hums, patient: String(s.state.patient) },
  }))
  return [...paces, ...styles]
}
