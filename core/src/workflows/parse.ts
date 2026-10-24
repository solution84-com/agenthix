/**
 * Reads a workflow definition — `workflow.yaml` as hq's YAML reader leaves it, plain data — into a
 * `WorkflowDefinition`, or the list of everything wrong with it. hq reads the YAML once, at proposal; from then on
 * the parsed definition is what is hashed, stored, sent to the site and rechecked there, so the site never reads
 * YAML and two readers can't disagree. A key this reader doesn't know is an error, never ignored: a misspelt
 * `secret:` must not quietly give a step nothing, or something else.
 */
import {
  WORKFLOW_LIMITS as L, WORKFLOW_RUN_TIMEOUT_DEFAULT_SECONDS, WORKFLOW_TIMEOUT_MAX_SECONDS,
  type WorkflowDefinition, type WorkflowDefinitionError, type WorkflowDefinitionNote, type WorkflowDefinitionParse,
  type WorkflowParameter, type WorkflowStep,
} from './definition.js'
import { GITHUB_PERMISSION_LEVELS, GITHUB_READ_ONLY_PERMISSIONS, isGitHubRepositoryPermission, type GitHubPermissionLevel, type GitHubPermissions } from './githubPermissions.js'
import { formatWorkflowHost, parseWorkflowHost, type WorkflowHost } from './hosts.js'
import { INTEGRATION_SECRET_NAMES, validateParameterName, validateSecretName, validateVariableName, validateWorkflowName } from './names.js'
import { fileNamedByRun, normaliseWorkflowPath } from './paths.js'
import { readParameterPattern } from './patterns.js'

const TOP_KEYS = ['name', 'description', 'steps', 'variables', 'parameters', 'hosts', 'github', 'timeout', 'files']
const STEP_KEYS = ['name', 'run', 'secrets', 'timeout']
const PARAMETER_KEYS = ['name', 'pattern', 'values', 'text']
const DURATION_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/

type Raw = Record<string, unknown>
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasControl = (s: string) => /[\u0000-\u001f\u007f]/.test(s)

/** `10m`, `90s`, `1h30m` → seconds; null when it isn't a duration. */
export function parseWorkflowDuration(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const m = DURATION_RE.exec(raw.trim())
  if (!m || raw.trim() === '') return null
  const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return seconds > 0 ? seconds : null
}

export function parseWorkflowDefinition(raw: unknown): WorkflowDefinitionParse {
  const errors: WorkflowDefinitionError[] = []
  const notes: WorkflowDefinitionNote[] = []
  const err = (path: string, message: string) => { errors.push({ path, message }) }
  if (!isRecord(raw)) return { ok: false, errors: [{ path: '', message: 'A workflow definition is a mapping of fields, such as name: and steps:.' }] }
  unknownKeys(raw, TOP_KEYS, '', err)

  const name = typeof raw.name === 'string' ? raw.name : ''
  const named = validateWorkflowName(name)
  if (!named.ok) err('name', named.reason!)

  let description = ''
  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string') err('description', 'A description is text.')
    else if (raw.description.length > L.descriptionMax) err('description', `A description is at most ${L.descriptionMax} characters.`)
    else if (hasControl(raw.description.replace(/\n/g, ''))) err('description', 'A description cannot hold control characters.')
    else description = raw.description.trim()
  }

  const timeoutSeconds = raw.timeout === undefined ? WORKFLOW_RUN_TIMEOUT_DEFAULT_SECONDS : timeout(raw.timeout, 'timeout', err)
  const variables = nameList(raw.variables, 'variables', L.variablesMax, n => validateVariableName(n), err)
  const hosts = hostList(raw.hosts, err)
  const github = permissions(raw.github, err)
  const parameters = parameterList(raw.parameters, err, notes)
  const steps = stepList(raw.steps, timeoutSeconds ?? WORKFLOW_TIMEOUT_MAX_SECONDS, err)

  const files = new Set<string>()
  if (raw.files !== undefined) {
    if (!Array.isArray(raw.files)) err('files', 'files: is a list of paths.')
    else raw.files.forEach((f, i) => {
      const p = typeof f === 'string' ? normaliseWorkflowPath(f) : { ok: false as const, reason: 'A path is text.' }
      if (!p.ok) err(`files[${i}]`, p.reason)
      else if (files.has(p.path)) err(`files[${i}]`, `${p.path} is listed twice.`)
      else files.add(p.path)
    })
  }
  steps.forEach((s, i) => {
    const named = fileNamedByRun(s.run)
    if (named === null) return
    const p = normaliseWorkflowPath(named)
    if (!p.ok) err(`steps[${i}].run`, p.reason)
    else files.add(p.path)
  })
  if (files.size > L.filesMax) err('files', `A workflow has at most ${L.filesMax} files.`)

  const secretNames = new Set(steps.flatMap(s => s.secrets))
  for (const v of variables) if (secretNames.has(v)) err('variables', `${v} is named both as a variable and as a secret.`)
  const usesToken = steps.some(s => s.secrets.includes(INTEGRATION_SECRET_NAMES[0]))
  const declaresGitHub = raw.github !== undefined
  const githubErrors = errors.some(e => e.path.startsWith('github'))
  // An empty list must never reach the mint gate: GitHub gives a token asked for with no permissions all of them.
  if (usesToken && !githubErrors && Object.keys(github).length === 0) {
    err('github', 'A step names GITHUB_TOKEN, so the workflow must declare the GitHub permissions it needs under github:, such as contents: write.')
  }
  if (declaresGitHub && !usesToken) err('github', 'GitHub permissions are given only to GITHUB_TOKEN, and no step names it.')

  if (errors.length) return { ok: false, errors }
  const definition: WorkflowDefinition = {
    name, description, steps, variables, parameters, hosts, github,
    timeoutSeconds: timeoutSeconds!, files: [...files].sort(),
  }
  return { ok: true, definition, notes }
}

function unknownKeys(r: Raw, known: string[], at: string, err: (p: string, m: string) => void) {
  for (const k of Object.keys(r)) if (!known.includes(k)) err(at ? `${at}.${k}` : k, `${k} is not a field here; the fields are ${known.join(', ')}.`)
}

function timeout(raw: unknown, path: string, err: (p: string, m: string) => void): number | null {
  const s = parseWorkflowDuration(raw)
  if (s === null) { err(path, 'A time limit is written like 90s, 10m or 1h30m.'); return null }
  if (s > WORKFLOW_TIMEOUT_MAX_SECONDS) { err(path, 'A time limit is at most 6h.'); return null }
  return s
}

function nameList(
  raw: unknown, path: string, max: number, check: (n: string) => { ok: boolean; reason?: string },
  err: (p: string, m: string) => void,
): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) { err(path, `${path}: is a list of names.`); return [] }
  if (raw.length > max) err(path, `At most ${max} names here.`)
  const out = new Set<string>()
  raw.forEach((n, i) => {
    if (typeof n !== 'string') return err(`${path}[${i}]`, 'A name is text.')
    const v = check(n)
    if (!v.ok) err(`${path}[${i}]`, v.reason!)
    else if (out.has(n)) err(`${path}[${i}]`, `${n} is listed twice.`)
    else out.add(n)
  })
  return [...out].sort()
}

function hostList(raw: unknown, err: (p: string, m: string) => void): WorkflowHost[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) { err('hosts', 'hosts: is a list of host:port pairs.'); return [] }
  if (raw.length > L.hostsMax) err('hosts', `At most ${L.hostsMax} hosts.`)
  const out = new Map<string, WorkflowHost>()
  raw.forEach((h, i) => {
    const p = typeof h === 'string' ? parseWorkflowHost(h) : { ok: false as const, reason: 'A host is text, such as api.github.com:443.' }
    if (!p.ok) return err(`hosts[${i}]`, p.reason)
    const key = formatWorkflowHost(p.host)
    if (out.has(key)) err(`hosts[${i}]`, `${key} is listed twice.`)
    out.set(key, p.host)
  })
  return [...out.keys()].sort().map(k => out.get(k)!)
}

function permissions(raw: unknown, err: (p: string, m: string) => void): GitHubPermissions {
  if (raw === undefined) return {}
  if (!isRecord(raw)) { err('github', 'github: maps each permission to read or write, such as contents: write.'); return {} }
  const out: GitHubPermissions = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!isGitHubRepositoryPermission(k)) { err(`github.${k}`, `${k} is not a GitHub permission a repository's token can have.`); continue }
    if (!(GITHUB_PERMISSION_LEVELS as readonly unknown[]).includes(v)) { err(`github.${k}`, 'A permission is read or write.'); continue }
    if (v === 'write' && GITHUB_READ_ONLY_PERMISSIONS.includes(k)) { err(`github.${k}`, `GitHub grants ${k} only to read.`); continue }
    out[k] = v as GitHubPermissionLevel
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1))) as GitHubPermissions
}

function parameterList(raw: unknown, err: (p: string, m: string) => void, notes: WorkflowDefinitionNote[]): WorkflowParameter[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) { err('parameters', 'parameters: is a list.'); return [] }
  if (raw.length > L.parametersMax) err('parameters', `At most ${L.parametersMax} parameters.`)
  const out: WorkflowParameter[] = []
  const seen = new Set<string>()
  raw.forEach((p, i) => {
    const at = `parameters[${i}]`
    if (!isRecord(p)) return err(at, 'A parameter has a name and one of pattern, values or text: true.')
    unknownKeys(p, PARAMETER_KEYS, at, err)
    const name = typeof p.name === 'string' ? p.name : ''
    const v = validateParameterName(name)
    if (!v.ok) return err(`${at}.name`, v.reason!)
    if (seen.has(name)) return err(`${at}.name`, `${name} is listed twice.`)
    seen.add(name)
    const kinds = ['pattern', 'values', 'text'].filter(k => p[k] !== undefined)
    if (kinds.length !== 1) return err(at, `${name} needs exactly one of pattern, values or text: true.`)
    if (p.text !== undefined) {
      if (p.text !== true) return err(`${at}.text`, 'text: is true or left out.')
      out.push({ name, kind: 'text' })
    } else if (p.pattern !== undefined) {
      if (typeof p.pattern !== 'string') return err(`${at}.pattern`, 'A pattern is text.')
      const r = readParameterPattern(p.pattern)
      if (!r.ok) return err(`${at}.pattern`, r.reason)
      if (r.canStartWithDash) notes.push({ code: 'parameter_may_start_with_dash', path: `${at}.pattern`, message: `${name}'s pattern can match a value starting with -, which a command would read as an option.` })
      out.push({ name, kind: 'pattern', pattern: p.pattern })
    } else {
      const values = p.values
      if (!Array.isArray(values) || values.length === 0) return err(`${at}.values`, 'values: is a list of at least one value.')
      if (values.length > L.valuesMax) return err(`${at}.values`, `At most ${L.valuesMax} values.`)
      const bad = values.findIndex(x => typeof x !== 'string' || x.length > L.parameterValueMax || hasControl(x))
      if (bad >= 0) return err(`${at}.values[${bad}]`, `A value is one line of text, at most ${L.parameterValueMax} characters.`)
      if (new Set(values).size !== values.length) return err(`${at}.values`, 'A value is listed twice.')
      if ((values as string[]).some(x => x.startsWith('-'))) notes.push({ code: 'parameter_may_start_with_dash', path: `${at}.values`, message: `One of ${name}'s values starts with -, which a command would read as an option.` })
      out.push({ name, kind: 'values', values: values as string[] })
    }
  })
  return out
}

function stepList(raw: unknown, runTimeout: number, err: (p: string, m: string) => void): WorkflowStep[] {
  if (!Array.isArray(raw) || raw.length === 0) { err('steps', 'A workflow needs at least one step.'); return [] }
  if (raw.length > L.stepsMax) err('steps', `A workflow has at most ${L.stepsMax} steps.`)
  const out: WorkflowStep[] = []
  raw.forEach((s, i) => {
    const at = `steps[${i}]`
    if (!isRecord(s)) return err(at, 'A step has a name and a run.')
    unknownKeys(s, STEP_KEYS, at, err)
    const name = typeof s.name === 'string' ? s.name.trim() : ''
    if (!name || name.length > L.stepNameMax || hasControl(name)) err(`${at}.name`, `A step needs a name of one line, at most ${L.stepNameMax} characters.`)
    const run = typeof s.run === 'string' ? s.run : ''
    if (!run.trim()) err(`${at}.run`, 'A step needs something to run.')
    else if (run.length > L.runMax) err(`${at}.run`, `A step's run is at most ${L.runMax} characters.`)
    else if (run.includes('\0')) err(`${at}.run`, 'A step\'s run cannot hold a NUL character.')
    const secrets = nameList(s.secrets, `${at}.secrets`, L.secretsPerStepMax, n => validateSecretName(n), err)
    let timeoutSeconds: number | null = null
    if (s.timeout !== undefined) {
      timeoutSeconds = timeout(s.timeout, `${at}.timeout`, err)
      if (timeoutSeconds !== null && timeoutSeconds > runTimeout) err(`${at}.timeout`, 'A step\'s time limit cannot be longer than the run\'s.')
    }
    out.push({ name, run, secrets, timeoutSeconds })
  })
  return out
}
