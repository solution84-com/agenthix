/**
 * The voice profile and the voice hint in the Log (spec §Tone): a VOICE row beside your words for each reading that
 * changed (`happy 0.71 · laughing 0.83`), which cuts no stretch of them; and a TONE row as the voice hint the models are
 * offered changes. Each line's and each reply's own tone is on its LIGHT and HEAVY rows.
 */
import type { LogStep } from './logModel'
import type { PageTrail } from './pageTrail'

export function toneSteps(trail: PageTrail): LogStep[] {
  const voices = trail.voices.map((v): LogStep => ({
    id: `voice-${v.at}`, at: v.at, actor: 'VOICE', tag: 'voice', title: v.words, aside: true,
    detail: `${v.final ? 'on a final transcript' : 'on a partial transcript'} · reading ${v.count}`, attrs: { final: String(v.final) },
  }))
  const tones = trail.tones.map((t): LogStep => ({
    id: `tone-${t.at}`, at: t.at, actor: 'TONE', tag: 'tone', aside: true,
    title: t.hint ? `you sound ${t.hint}: offered to the light model and the listening read` : 'no voice hint offered',
    attrs: { hint: t.hint ?? 'none' },
  }))
  return [...voices, ...tones].sort((a, b) => a.at - b.at)
}
