/**
 * The version hash (spec part 1, *A version*): SHA-256 over one encoding of everything a run instruction carries —
 * the definition, each file's path, mode and bytes, the names `set-github-secrets` was approved for, and the
 * executor image's digest. hq computes it at proposal and before every run; the site recomputes it from the run
 * instruction and refuses the run if it differs (attack A8).
 *
 * **The encoding** is a tagged, length-prefixed form, so no two different contents encode alike:
 *
 * | Value | Bytes |
 * |---|---|
 * | text | `s`, its UTF-8 length as 8 bytes big-endian, its UTF-8 bytes |
 * | bytes | `b`, the length as 8 bytes big-endian, the bytes |
 * | whole number (≥ 0) | `i`, 8 bytes big-endian |
 * | true / false / null | `t` / `f` / `n` |
 * | list | `l`, the count as 8 bytes big-endian, each item |
 * | record | `r`, the count as 8 bytes big-endian, then each key (as text) and its value, keys in ascending order |
 *
 * The whole content is one record whose `format` is `workflow-version/1`. Sets — a step's secrets, the variables,
 * the hosts, the files, the GitHub secret names — are sorted; steps, parameters and a parameter's values keep their
 * order. Changing any of this changes every hash, so it is pinned by the test vectors beside it: a change to the
 * encoding is a new `format`, never an edit.
 */
import { subtle } from '../host/crypto/webCrypto.js'
import type { WorkflowDefinition, WorkflowParameter } from './definition.js'
import { WORKFLOW_LIMITS as L } from './definition.js'
import { formatWorkflowHost } from './hosts.js'
import { validateStoredSecretName } from './names.js'
import { normaliseWorkflowPath } from './paths.js'

export const WORKFLOW_VERSION_FORMAT = 'workflow-version/1'
export const EXECUTOR_IMAGE_DIGEST_RE = /^sha256:[0-9a-f]{64}$/

export type WorkflowVersionFile = { path: string; bytes: Uint8Array; executable: boolean }

export type WorkflowVersionContent = {
  definition: WorkflowDefinition
  files: WorkflowVersionFile[]
  /** The secrets `set-github-secrets` was approved to set on GitHub; empty for every other workflow. */
  githubSecretNames: string[]
  /** `sha256:` and 64 lower-case hex digits. */
  executorImageDigest: string
}

type Value = string | Uint8Array | number | boolean | null | Value[] | { [key: string]: Value }

/** What is wrong with a version's content; empty when it may be hashed. */
export function checkVersionContent(c: WorkflowVersionContent): string[] {
  const problems: string[] = []
  if (!EXECUTOR_IMAGE_DIGEST_RE.test(c.executorImageDigest)) problems.push('The executor image digest is not sha256: and 64 hex digits.')
  const paths = new Set<string>()
  let total = 0
  for (const f of c.files) {
    const p = normaliseWorkflowPath(f.path)
    if (!p.ok || p.path !== f.path) problems.push(`${f.path} is not a normalised path.`)
    if (paths.has(f.path)) problems.push(`${f.path} is given twice.`)
    paths.add(f.path)
    if (f.bytes.length > L.fileBytesMax) problems.push(`${f.path} is larger than ${L.fileBytesMax} bytes.`)
    total += f.bytes.length
  }
  if (total > L.filesBytesMax) problems.push(`The files together are larger than ${L.filesBytesMax} bytes.`)
  const named = new Set(c.definition.files)
  for (const p of named) if (!paths.has(p)) problems.push(`${p} is named by the definition but not given.`)
  for (const p of paths) if (!named.has(p)) problems.push(`${p} is given but the definition doesn't name it.`)
  if (new Set(c.githubSecretNames).size !== c.githubSecretNames.length) problems.push('A GitHub secret name is given twice.')
  for (const n of c.githubSecretNames) {
    const v = validateStoredSecretName(n)
    if (!v.ok) problems.push(v.reason!)
  }
  return problems
}

/** The encoding the hash is taken over. Throws on content `checkVersionContent` refuses. */
export function encodeWorkflowVersion(c: WorkflowVersionContent): Uint8Array {
  const problems = checkVersionContent(c)
  if (problems.length) throw new Error(`This version can't be hashed: ${problems.join(' ')}`)
  const d = c.definition
  const sorted = (xs: string[]) => [...xs].sort(ascending)
  const value: Value = {
    format: WORKFLOW_VERSION_FORMAT,
    name: d.name,
    description: d.description,
    steps: d.steps.map(s => ({ name: s.name, run: s.run, secrets: sorted(s.secrets), timeoutSeconds: s.timeoutSeconds })),
    variables: sorted(d.variables),
    parameters: d.parameters.map(parameterValue),
    hosts: [...d.hosts].sort((a, b) => ascending(formatWorkflowHost(a), formatWorkflowHost(b))).map(h => ({ host: h.host, port: h.port })),
    github: Object.fromEntries(Object.entries(d.github).filter(([, v]) => v !== undefined)) as Record<string, string>,
    timeoutSeconds: d.timeoutSeconds,
    files: [...c.files].sort((a, b) => ascending(a.path, b.path)).map(f => ({ path: f.path, executable: f.executable, bytes: f.bytes })),
    githubSecretNames: sorted(c.githubSecretNames),
    executorImageDigest: c.executorImageDigest,
  }
  const out = new Writer()
  out.value(value)
  return out.bytes()
}

/** The version's hash: 64 lower-case hex digits. */
export async function hashWorkflowVersion(c: WorkflowVersionContent): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', encodeWorkflowVersion(c)))
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('')
}

function parameterValue(p: WorkflowParameter): Value {
  if (p.kind === 'pattern') return { name: p.name, kind: p.kind, pattern: p.pattern }
  if (p.kind === 'values') return { name: p.name, kind: p.kind, values: p.values }
  return { name: p.name, kind: p.kind }
}

function ascending(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function utf8(s: string): Uint8Array {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    // Replacing a lone surrogate would give two different texts one encoding.
    if (cp >= 0xd800 && cp <= 0xdfff) throw new Error('This version holds text that is not valid Unicode.')
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
  }
  return Uint8Array.from(out)
}

class Writer {
  private chunks: Uint8Array[] = []
  private size = 0

  private push(b: Uint8Array) { this.chunks.push(b); this.size += b.length }
  private tag(t: string) { this.push(Uint8Array.of(t.charCodeAt(0))) }
  private u64(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${n} is not a whole number the encoding can hold.`)
    const b = new Uint8Array(8)
    let rest = n
    for (let i = 7; i >= 0; i--) { b[i] = rest % 256; rest = Math.floor(rest / 256) }
    this.push(b)
  }

  value(v: Value): void {
    if (v === null) return this.tag('n')
    if (v === true) return this.tag('t')
    if (v === false) return this.tag('f')
    if (typeof v === 'string') { const b = utf8(v); this.tag('s'); this.u64(b.length); return this.push(b) }
    if (typeof v === 'number') { this.tag('i'); return this.u64(v) }
    if (v instanceof Uint8Array) { this.tag('b'); this.u64(v.length); return this.push(v) }
    if (Array.isArray(v)) { this.tag('l'); this.u64(v.length); for (const item of v) this.value(item); return }
    const keys = Object.keys(v).sort(ascending)
    this.tag('r'); this.u64(keys.length)
    for (const k of keys) { this.value(k); this.value(v[k]) }
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.size)
    let at = 0
    for (const c of this.chunks) { out.set(c, at); at += c.length }
    return out
  }
}
