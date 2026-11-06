/**
 * The models a picker offers (models from one place, part 4 and part 1, *When a provider fails*): every model via a
 * provider the resolver would let this call run, found on the server each time. A provider that is not working stays
 * listed, greyed out and marked, so nobody wonders where a model went, and it cannot be picked (`choicesFor` and the
 * checks that follow a pick never offer it).
 */
import { modelTakesImages, type ModelChoice, type ModelViaProvider, type ResolveRequest } from '@agenthix/core'
import { choiceValue } from '../conversations/access/talkingModel'
import { whyUnusable, type Snapshot } from '../routing/decide'
import { makerAndName, modelsReachedBy } from '../routing/modelKeys'
import { readSnapshot } from '../routing/snapshot'
import { makerLabel, priceOf } from './coverage'

const KNOWN_MAKERS = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek']

export function viaOf(snap: Snapshot, providerId: string): string | null {
  const p = snap.providers.find(x => x.id === providerId)
  if (!p) return null
  return p.ownerUserId ? 'via your Claude subscription' : `via ${p.name}`
}

export function toChoice(c: ModelViaProvider, snap: Snapshot): ModelChoice | null {
  const p = snap.providers.find(x => x.id === c.providerId)
  if (!p) return null
  const reached = modelsReachedBy(p.vendor, [c.model]).find(m => m.model === c.model)
  // Whether it sees a picture, from the catalogue's input modalities; unsaid for a model nobody knows.
  const images = modelTakesImages(p.vendor, c.model)
  return {
    value: choiceValue(c), label: reached?.label ?? c.model, maker: makerLabel(makerAndName(p.vendor, c.model)),
    via: viaOf(snap, p.id)!, price: priceOf(reached?.costRank ?? null), ...(images !== null && { images }),
  }
}

/** The models typed on an OpenAI-compatible endpoint: those the organisation's and the agent's choices name. */
export function typedOn(snap: Snapshot): Map<string, string[]> {
  const typed = new Map<string, string[]>()
  for (const c of [snap.org.conversation, snap.org.worker, snap.agent?.conversation, snap.agent?.worker]) {
    const p = c && snap.providers.find(x => x.id === c.providerId)
    if (c && p && p.vendor === 'openai_compatible') typed.set(p.id, [...(typed.get(p.id) ?? []), c.model])
  }
  return typed
}

const makerOrder = (maker: string) => {
  const i = KNOWN_MAKERS.indexOf(maker)
  return i === -1 ? KNOWN_MAKERS.length : i
}

/** The best-known makers first, then the rest by name; within a maker, the newest names first. */
export function byMaker(a: ModelChoice, b: ModelChoice): number {
  return makerOrder(a.maker) - makerOrder(b.maker) || a.maker.localeCompare(b.maker) ||
    b.label.localeCompare(a.label, undefined, { numeric: true }) || a.via.localeCompare(b.via)
}

/**
 * Everything the request may run on, plus the same models on a provider that is not working. A model a list or a
 * place rules out is left out altogether; only the provider's state greys one.
 */
export async function offeredFor(req: ResolveRequest): Promise<{ models: ModelChoice[]; byValue: Map<string, ModelChoice>; snapshot: Snapshot }> {
  const snapshot = await readSnapshot(req)
  const typed = typedOn(snapshot)
  const models: ModelChoice[] = []
  // The same snapshot as if every provider worked: what only a provider's state rules out is greyed, not hidden.
  const working: Snapshot = { ...snapshot, providers: snapshot.providers.map(p => ({ ...p, state: 'works' as const })) }
  for (const p of snapshot.providers) {
    for (const m of modelsReachedBy(p.vendor, typed.get(p.id) ?? [])) {
      const choice = { providerId: p.id, model: m.model }
      const why = whyUnusable(choice, req, snapshot)
      if (why && (why.code !== 'provider_not_working' || whyUnusable(choice, req, working))) continue
      const shown = toChoice(choice, snapshot)
      if (shown) models.push(why ? { ...shown, notWorking: true } : shown)
    }
  }
  models.sort(byMaker)
  return { models, byValue: new Map(models.map(m => [m.value, m])), snapshot }
}
