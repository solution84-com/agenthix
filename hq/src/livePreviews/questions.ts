/**
 * A live preview's services and the questions it waits on (live preview spec section 4, *The app*): only an install
 * script and a new or changed service ask, and the question names what it is for. The site says what it found
 * (`livePreview.services`, `livePreview.packageBlocked`); hq keeps the latest in memory for the screens, words each
 * question itself, and passes a person's yes to the site (`livePreview.act`), which checks it against its own record.
 * hq restarting forgets them; the site says them again the next time an app starts.
 */
import {
  installScriptQuestion, SERVICE_STATES,
  type InstallScriptVerdict, type PackageFacts, type ServiceStatus,
} from '@agenthix/core'
import type { LivePreviewQuestion } from './types'

type Blocked = { ecosystem: string; name: string; version: string; question: string }

const services = new Map<string, ServiceStatus[]>()
const blocked = new Map<string, Blocked[]>()

const MAX_SERVICES = 20
const MAX_BLOCKED = 20
const TEXT = /^[\x20-\x7e]{1,214}$/

function serviceOf(v: unknown): ServiceStatus | null {
  const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  if (!s || typeof s.name !== 'string' || !TEXT.test(s.name) || !SERVICE_STATES.includes(s.state as ServiceStatus['state'])) return null
  if (typeof s.declarationHash !== 'string' || !/^[0-9a-f]{64}$/.test(s.declarationHash)) return null
  if (!s.declaration || typeof s.declaration !== 'object') return null
  const detail = typeof s.detail === 'string' ? s.detail.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500) : null
  return { name: s.name, state: s.state as ServiceStatus['state'], declarationHash: s.declarationHash, declaration: s.declaration as ServiceStatus['declaration'], detail }
}

/** What the site last said of the live preview's services, each read field by field; the rest dropped. */
export function keepServices(livePreviewId: string, list: unknown): ServiceStatus[] {
  const kept = (Array.isArray(list) ? list : []).slice(0, MAX_SERVICES).map(serviceOf).filter((s): s is ServiceStatus => s !== null)
  services.set(livePreviewId, kept)
  return kept
}

export function servicesOf(livePreviewId: string): ServiceStatus[] {
  return services.get(livePreviewId) ?? []
}

/** A package the rule blocked; hq writes the question from the facts, never the site's sentence. */
export function keepBlocked(
  livePreviewId: string,
  pkg: { ecosystem: string; name: string; version: string },
  facts: PackageFacts | null,
  verdict: InstallScriptVerdict,
  now = Date.now(),
): boolean {
  if (![pkg.ecosystem, pkg.name, pkg.version].every(v => typeof v === 'string' && TEXT.test(v))) return false
  const list = (blocked.get(livePreviewId) ?? []).filter(b => !(b.ecosystem === pkg.ecosystem && b.name === pkg.name && b.version === pkg.version))
  const question = installScriptQuestion(facts && facts.name === pkg.name ? facts : null, verdict, now) ||
    `${pkg.name} ${pkg.version} runs code when installed. Let its install script run in this live preview?`
  list.push({ ...pkg, question: question.slice(0, 1000) })
  blocked.set(livePreviewId, list.slice(-MAX_BLOCKED))
  return true
}

export function forgetBlocked(livePreviewId: string, pkg: { ecosystem: string; name: string; version: string }): void {
  const list = blocked.get(livePreviewId)
  if (list) blocked.set(livePreviewId, list.filter(b => !(b.ecosystem === pkg.ecosystem && b.name === pkg.name && b.version === pkg.version)))
}

export function isBlocked(livePreviewId: string, pkg: { ecosystem: string; name: string; version: string }): boolean {
  return (blocked.get(livePreviewId) ?? []).some(b => b.ecosystem === pkg.ecosystem && b.name === pkg.name && b.version === pkg.version)
}

function serviceQuestion(s: ServiceStatus): LivePreviewQuestion {
  const image = typeof (s.declaration as { image?: unknown }).image === 'string' ? (s.declaration as { image: string }).image : null
  return {
    kind: 'service.start', service: s.name, declaration: s.declarationHash, image,
    question: `The app wants to run the service ${s.name}${image ? ` (${image})` : ''} beside it, as .agents/services.yaml declares. Start it?`,
  }
}

export function questionsOf(livePreviewId: string): LivePreviewQuestion[] {
  const waiting = servicesOf(livePreviewId).filter(s => s.state === 'waiting').map(serviceQuestion)
  const packages = (blocked.get(livePreviewId) ?? []).map((b): LivePreviewQuestion => ({ kind: 'package.use', ...b }))
  return [...waiting, ...packages]
}

/** The live preview stopped: nothing it asked stands. */
export function forgetLivePreview(livePreviewId: string): void {
  services.delete(livePreviewId)
  blocked.delete(livePreviewId)
}

export function __resetQuestionsForTests(): void {
  services.clear()
  blocked.clear()
}
