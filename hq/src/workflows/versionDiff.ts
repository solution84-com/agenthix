/**
 * What changed between the approved version and another, for the screen a person approves from (spec part 5,
 * *Approving*): each file added, removed or changed, a changed text file line by line, and the definition's
 * settings side by side. The plain checks read the same versions on their own; nothing here decides anything.
 */
import type { WorkflowDefinition } from '@agenthix/core'

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

export type FileDiff =
  | { path: string; change: 'added' | 'removed' | 'changed' | 'same'; lines: DiffLine[] | null; binary: boolean; modeChanged: boolean }

export type SettingDiff = { setting: string; before: string; after: string }

export type VersionDiff = { files: FileDiff[]; settings: SettingDiff[] }

export type DiffFile = { path: string; content: Uint8Array; executable: boolean }

/** Above this many line pairs a file is shown as changed without its lines. */
const LINE_PAIRS_MAX = 4_000_000

function asText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}

/** A longest-common-subsequence line diff; null when the files are too large to compare line by line. */
export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > LINE_PAIRS_MAX) return null
  const n = a.length
  const m = b.length
  const len: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++ }
    else if (len[i + 1][j] >= len[i][j + 1]) out.push({ kind: 'removed', text: a[i++] })
    else out.push({ kind: 'added', text: b[j++] })
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++] })
  while (j < m) out.push({ kind: 'added', text: b[j++] })
  return out
}

function sameBytes(x: Uint8Array, y: Uint8Array): boolean {
  if (x.length !== y.length) return false
  for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false
  return true
}

export function diffFiles(before: DiffFile[], after: DiffFile[]): FileDiff[] {
  const old = new Map(before.map((f) => [f.path, f]))
  const now = new Map(after.map((f) => [f.path, f]))
  const paths = [...new Set([...old.keys(), ...now.keys()])].sort()
  return paths.map((path): FileDiff => {
    const o = old.get(path)
    const n = now.get(path)
    if (!o || !n) {
      const f = (o ?? n)!
      const text = asText(f.content)
      const lines = text === null ? null : text.split('\n').map((t): DiffLine => ({ kind: o ? 'removed' : 'added', text: t }))
      return { path, change: o ? 'removed' : 'added', lines, binary: text === null, modeChanged: false }
    }
    const modeChanged = o.executable !== n.executable
    if (sameBytes(o.content, n.content)) return { path, change: modeChanged ? 'changed' : 'same', lines: null, binary: false, modeChanged }
    const ot = asText(o.content)
    const nt = asText(n.content)
    const binary = ot === null || nt === null
    return { path, change: 'changed', lines: binary ? null : diffLines(ot, nt), binary, modeChanged }
  })
}

function settingsOf(d: WorkflowDefinition): Record<string, string> {
  const out: Record<string, string> = {
    name: d.name,
    description: d.description,
    hosts: d.hosts.map((h) => `${h.host}:${h.port}`).join(', '),
    variables: d.variables.join(', '),
    github: Object.entries(d.github).map(([k, v]) => `${k}: ${v}`).sort().join(', '),
    timeout: `${d.timeoutSeconds}s`,
    parameters: d.parameters.map((p) => p.kind === 'pattern' ? `${p.name} ~ ${p.pattern}` : p.kind === 'values' ? `${p.name} in [${p.values.join(', ')}]` : `${p.name} (text)`).join('; '),
  }
  d.steps.forEach((s, i) => {
    out[`steps[${i}]`] = `${s.name} | run: ${s.run} | secrets: ${s.secrets.join(', ') || 'none'}${s.timeoutSeconds ? ` | timeout: ${s.timeoutSeconds}s` : ''}`
  })
  return out
}

export function diffSettings(before: WorkflowDefinition | null, after: WorkflowDefinition): SettingDiff[] {
  const o = before ? settingsOf(before) : {}
  const n = settingsOf(after)
  const keys = [...new Set([...Object.keys(n), ...Object.keys(o)])]
  return keys.filter((k) => (o[k] ?? '') !== (n[k] ?? '')).map((k) => ({ setting: k, before: o[k] ?? '', after: n[k] ?? '' }))
}

export function diffVersions(
  before: { definition: WorkflowDefinition; files: DiffFile[] } | null,
  after: { definition: WorkflowDefinition; files: DiffFile[] },
): VersionDiff {
  return { files: diffFiles(before?.files ?? [], after.files), settings: diffSettings(before?.definition ?? null, after.definition) }
}
