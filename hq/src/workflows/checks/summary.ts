/**
 * The card's one-line summary (workflows spec part 1, *R1*), written from the plain checks' own reading of what
 * changed — never from the agent's words or the reviewer's. Steps are named by number, never by the name the agent
 * gave them, and the rest is names hq checked: secrets and variables that exist, hosts, permissions, file paths.
 */
import type { WorkflowVersionContent } from '@agenthix/core'
import { diffFiles } from '../versionDiff'
import { hostKey, permissionWords } from './flag'

const SUMMARY_MAX = 280

const list = (xs: string[]) => xs.join(', ')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function added<T>(now: T[], before: T[]): T[] {
  const b = new Set(before)
  return now.filter((x) => !b.has(x))
}

function firstVersion(c: WorkflowVersionContent): string {
  const d = c.definition
  const secrets = [...new Set(d.steps.flatMap((s) => s.secrets))].sort()
  const parts = [plural(d.steps.length, 'step')]
  if (secrets.length) parts.push(`secrets ${list(secrets)}`)
  if (d.variables.length) parts.push(`variables ${list(d.variables)}`)
  if (d.hosts.length) parts.push(`hosts ${list(d.hosts.map(hostKey))}`)
  const github = Object.entries(d.github).map(([k, v]) => `${permissionWords(k)}: ${v}`)
  if (github.length) parts.push(`GitHub ${list(github)}`)
  if (d.parameters.length) parts.push(plural(d.parameters.length, 'parameter'))
  if (c.files.length) parts.push(plural(c.files.length, 'file'))
  return `New workflow ${d.name}: ${parts.join('; ')}.`
}

function changes(c: WorkflowVersionContent, a: WorkflowVersionContent): string[] {
  const d = c.definition
  const o = a.definition
  const parts: string[] = []
  const oldByName = new Map(o.steps.map((s) => [s.name, s]))
  const newNames = new Set(d.steps.map((s) => s.name))
  d.steps.forEach((s, i) => {
    const old = oldByName.get(s.name)
    if (!old) { parts.push(`adds step ${i + 1}`); return }
    if (old.run !== s.run) parts.push(`changes what step ${i + 1} runs`)
    const given = added(s.secrets, old.secrets)
    if (given.length) parts.push(`gives ${list(given)} to step ${i + 1}`)
    const taken = added(old.secrets, s.secrets)
    if (taken.length) parts.push(`takes ${list(taken)} from step ${i + 1}`)
  })
  const removed = o.steps.filter((s) => !newNames.has(s.name)).length
  if (removed) parts.push(`removes ${plural(removed, 'step')}`)

  const files = diffFiles(a.files.map((f) => ({ path: f.path, content: f.bytes, executable: f.executable })),
    c.files.map((f) => ({ path: f.path, content: f.bytes, executable: f.executable })))
  for (const kind of ['added', 'changed', 'removed'] as const) {
    const paths = files.filter((f) => f.change === kind).map((f) => f.path)
    const verb = kind === 'added' ? 'adds' : kind === 'changed' ? 'changes' : 'removes'
    if (paths.length) parts.push(`${verb} ${paths.length > 3 ? plural(paths.length, 'file') : list(paths)}`)
  }

  const hostsNow = d.hosts.map(hostKey)
  const hostsBefore = o.hosts.map(hostKey)
  if (added(hostsNow, hostsBefore).length) parts.push(`adds host ${list(added(hostsNow, hostsBefore))}`)
  if (added(hostsBefore, hostsNow).length) parts.push(`removes host ${list(added(hostsBefore, hostsNow))}`)
  if (added(d.variables, o.variables).length) parts.push(`adds variable ${list(added(d.variables, o.variables))}`)
  if (added(o.variables, d.variables).length) parts.push(`removes variable ${list(added(o.variables, d.variables))}`)
  if (JSON.stringify(d.github) !== JSON.stringify(o.github)) {
    const now = Object.entries(d.github).map(([k, v]) => `${permissionWords(k)}: ${v}`)
    parts.push(`GitHub permissions now ${now.length ? list(now) : 'none'}`)
  }
  if (JSON.stringify(d.parameters) !== JSON.stringify(o.parameters)) parts.push('changes its parameters')
  if (d.timeoutSeconds !== o.timeoutSeconds) parts.push('changes its time limit')
  if (d.description !== o.description) parts.push('changes its description')
  if (JSON.stringify(c.githubSecretNames) !== JSON.stringify(a.githubSecretNames)) parts.push('changes the GitHub secrets it sets')
  return parts
}

export function cardSummary(c: WorkflowVersionContent, approved: { number: number; content: WorkflowVersionContent } | null): string {
  if (!approved) return cap(firstVersion(c))
  const parts = changes(c, approved.content)
  if (!parts.length) {
    return c.executorImageDigest !== approved.content.executorImageDigest
      ? `The same as version ${approved.number}, on a new executor image.`
      : `The same as version ${approved.number}.`
  }
  const head = `Since version ${approved.number}: `
  let line = ''
  let shown = 0
  for (const p of parts) {
    const next = line ? `${line}; ${p}` : p
    if (shown > 0 && head.length + next.length + 20 > SUMMARY_MAX) break
    line = next
    shown++
  }
  const rest = parts.length - shown
  return cap(`${head}${line}${rest ? `; and ${plural(rest, 'more change')}` : ''}.`)
}

function cap(s: string): string {
  return s.length <= SUMMARY_MAX ? s : `${s.slice(0, SUMMARY_MAX - 1)}…`
}
