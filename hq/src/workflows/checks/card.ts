/**
 * Whether the card in the conversation may offer Approve (workflows spec part 1, *Approving from the card*), decided
 * by the plain checks alone: no step newly gets a secret; no `run` changes in a step that holds one; no host, GitHub
 * permission or parameter pattern changes; and no flag. With no approved version, the comparison is with nothing,
 * so a first version that gives any step a secret, or names a host, a permission or a parameter, needs the full
 * review. Steps are matched by name, since their order can change.
 */
import type { WorkflowCheckFlag, WorkflowStep, WorkflowVersionContent } from '@agenthix/core'
import { filesReached } from './code'
import { hostKey, stepWords } from './flag'

export type CardDecision = { mayApprove: true } | { mayApprove: false; reason: string }

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** The same `run`, reaching the same version files with the same bytes and mode. */
function sameRun(a: WorkflowVersionContent, i: number, b: WorkflowVersionContent, j: number): boolean {
  if (a.definition.steps[i].run !== b.definition.steps[j].run) return false
  const ra = filesReached(a, i)
  const rb = filesReached(b, j)
  if (ra.length !== rb.length || ra.some((p, k) => p !== rb[k])) return false
  const fa = new Map(a.files.map((f) => [f.path, f]))
  const fb = new Map(b.files.map((f) => [f.path, f]))
  return ra.every((p) => fa.get(p)!.executable === fb.get(p)!.executable && sameBytes(fa.get(p)!.bytes, fb.get(p)!.bytes))
}

const sortedJson = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x))

export function cardDecision(
  content: WorkflowVersionContent, approved: WorkflowVersionContent | null, flags: WorkflowCheckFlag[],
): CardDecision {
  const no = (reason: string): CardDecision => ({ mayApprove: false, reason })
  const before = approved?.definition.steps ?? []
  const byName = new Map<string, number[]>()
  before.forEach((s, j) => byName.set(s.name, [...(byName.get(s.name) ?? []), j]))
  const steps: WorkflowStep[] = content.definition.steps

  for (let i = 0; i < steps.length; i++) {
    const had = new Set((byName.get(steps[i].name) ?? []).flatMap((j) => before[j].secrets))
    const added = steps[i].secrets.filter((s) => !had.has(s))
    if (added.length) return no(`${stepWords(i)} newly gets ${added.join(', ')}.`)
  }
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].secrets.length) continue
    const matches = byName.get(steps[i].name) ?? []
    if (!approved || !matches.some((j) => sameRun(content, i, approved, j))) return no(`${stepWords(i)} holds a secret, and what it runs changed.`)
  }
  const d = content.definition
  const a = approved?.definition
  if (sortedJson(d.hosts.map(hostKey).sort()) !== sortedJson((a?.hosts ?? []).map(hostKey).sort())) return no('The hosts it may reach changed.')
  if (sortedJson(d.github) !== sortedJson(a?.github ?? {})) return no('Its GitHub permissions changed.')
  if (sortedJson(d.parameters) !== sortedJson(a?.parameters ?? [])) return no('Its parameters changed.')
  if (flags.length) return no(flags.length === 1 ? 'The plain checks raised a flag.' : `The plain checks raised ${flags.length} flags.`)
  return { mayApprove: true }
}
