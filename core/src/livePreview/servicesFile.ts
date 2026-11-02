/**
 * Reading a workspace's services file (services.ts) from the value a YAML parser made of it, where no Docker socket
 * is. Every problem is found, not only the first, so the agent can fix the file in one go. Nothing is filled in from
 * a variable, nothing is read from elsewhere, and only `SERVICE_FIELDS` pass.
 */
import { checkImage, readCommand, readDuration } from './serviceValues.js'
import {
  DEPENDS_CONDITIONS, SERVICE_FIELDS, SERVICE_LIMITS, SERVICE_WIDENING_FIELDS,
  type DependsCondition, type ServiceDeclaration, type ServiceHealthcheck, type ServiceProblem, type ServiceProblemCode,
  type ServicesFileRead,
} from './services.js'

const NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const VOLUME_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
/** `${X}`, `$X` or `$$`: what Compose would fill in or unescape, which here would silently mean something else. */
const VARIABLE = /\$(\{|[A-Za-z_]|\$)/
const RESERVED_NAMES = new Set(['localhost'])

type Map = Record<string, unknown>
const isMap = (v: unknown): v is Map => typeof v === 'object' && v !== null && !Array.isArray(v)

class Problems {
  list: ServiceProblem[] = []
  add(at: string, code: ServiceProblemCode, message: string): null {
    this.list.push({ at, code, message })
    return null
  }
  /** A string with no variable in it; numbers become their text. */
  text(at: string, v: unknown, max: number = SERVICE_LIMITS.valueChars): string | null {
    const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : v
    if (typeof s !== 'string' || s.length > max || s.includes('\0')) return this.add(at, 'badValue', 'Write this as text.')
    if (VARIABLE.test(s)) return this.add(at, 'interpolation', 'Variables are not filled in here: write the value itself.')
    return s
  }
}

export function readServicesFile(parsed: unknown): ServicesFileRead {
  const p = new Problems()
  if (!isMap(parsed) || !isMap(parsed.services)) {
    p.add('', 'notAFile', 'The file must be a mapping with services, such as services: { postgres: { image: postgres:16 } }.')
    return { ok: false, problems: p.list }
  }
  for (const key of Object.keys(parsed)) {
    if (key !== 'services' && key !== 'volumes') p.add(key, 'notAllowed', `${key} is not accepted here; only services and volumes are.`)
  }
  const volumes = readVolumes(p, parsed.volumes)
  const names = Object.keys(parsed.services)
  if (names.length === 0) p.add('services', 'notAFile', 'Declare at least one service.')
  if (names.length > SERVICE_LIMITS.services) p.add('services', 'tooMany', `At most ${SERVICE_LIMITS.services} services.`)
  const services: ServiceDeclaration[] = []
  const usedVolumes = new Map<string, string>()
  for (const name of names.sort()) {
    const at = `services.${name}`
    if (!NAME.test(name) || RESERVED_NAMES.has(name)) {
      p.add(at, 'badName', 'A service\'s name is lower-case letters, digits and dashes, such as postgres.')
      continue
    }
    const s = readService(p, at, name, parsed.services[name], volumes)
    if (!s) continue
    if (s.volume) {
      const other = usedVolumes.get(s.volume.name)
      if (other) p.add(`${at}.volumes`, 'volumeShared', `The volume ${s.volume.name} is already ${other}'s; give each service its own.`)
      usedVolumes.set(s.volume.name, name)
    }
    services.push(s)
  }
  checkDepends(p, services)
  return p.list.length ? { ok: false, problems: p.list } : { ok: true, services, volumes: [...volumes].sort() }
}

function readVolumes(p: Problems, v: unknown): Set<string> {
  const names = new Set<string>()
  if (v === undefined) return names
  if (!isMap(v)) {
    p.add('volumes', 'badValue', 'volumes is a mapping of names, such as volumes: { data: {} }.')
    return names
  }
  for (const [name, options] of Object.entries(v)) {
    if (!VOLUME_NAME.test(name)) p.add(`volumes.${name}`, 'badName', 'A volume\'s name is lower-case letters, digits, dashes and underscores.')
    else if (options !== null && !(isMap(options) && Object.keys(options).length === 0)) {
      p.add(`volumes.${name}`, 'volumeOptions', 'Declare a volume with no options, as {}: the site makes and keeps it.')
    } else names.add(name)
  }
  return names
}

function readService(p: Problems, at: string, name: string, v: unknown, volumes: Set<string>): ServiceDeclaration | null {
  if (!isMap(v)) return p.add(at, 'badValue', 'A service is a mapping, such as { image: postgres:16 }.')
  const before = p.list.length
  for (const key of Object.keys(v)) {
    if ((SERVICE_FIELDS as readonly string[]).includes(key)) continue
    const why = SERVICE_WIDENING_FIELDS[key]
    if (why) p.add(`${at}.${key}`, 'widens', `${key} is refused: ${why}.`)
    else p.add(`${at}.${key}`, 'notAllowed', `${key} is not accepted; a service takes only ${SERVICE_FIELDS.join(', ')}.`)
  }
  const image = typeof v.image === 'string' ? checkImage(v.image) : 'An image is required, such as postgres:16.'
  if (typeof image !== 'object') p.add(`${at}.image`, 'badImage', image)
  const command = v.command === undefined ? null : commandOf(p, `${at}.command`, v.command)
  const environment = readEnvironment(p, `${at}.environment`, v.environment)
  const expose = readExpose(p, `${at}.expose`, v.expose)
  const healthcheck = v.healthcheck === undefined ? null : readHealthcheck(p, `${at}.healthcheck`, v.healthcheck)
  const dependsOn = readDependsOn(p, `${at}.depends_on`, v.depends_on)
  const volume = readServiceVolume(p, `${at}.volumes`, v.volumes, volumes)
  if (p.list.length > before || typeof image !== 'object') return null
  return { name, image: image.image, command, environment, expose, healthcheck, dependsOn, volume }
}

function commandOf(p: Problems, at: string, v: unknown): string[] | null {
  const read = readCommand(v)
  if ('problem' in read) return p.add(at, 'badValue', read.problem)
  for (const [i, arg] of read.command.entries()) if (p.text(`${at}[${i}]`, arg, SERVICE_LIMITS.argChars) === null) return null
  return read.command
}

function readEnvironment(p: Problems, at: string, v: unknown): [string, string][] {
  if (v === undefined) return []
  let pairs: [string, unknown][]
  if (Array.isArray(v)) {
    pairs = v.map(item => {
      const i = typeof item === 'string' ? item.indexOf('=') : -1
      return i > 0 ? [(item as string).slice(0, i), (item as string).slice(i + 1)] : ['', null]
    })
  } else if (isMap(v)) pairs = Object.entries(v)
  else return (p.add(at, 'badValue', 'environment is a mapping of names to values.'), [])
  if (pairs.length > SERVICE_LIMITS.environment) p.add(at, 'tooMany', `At most ${SERVICE_LIMITS.environment} variables.`)
  const out = new Map<string, string>()
  for (const [name, value] of pairs) {
    if (!ENV_NAME.test(name)) { p.add(at, 'badName', 'Each variable is NAME: value, its name letters, digits and underscores.'); continue }
    if (value === null || value === undefined) {
      p.add(`${at}.${name}`, 'interpolation', 'A variable without a value would be taken from elsewhere; write its value.')
      continue
    }
    const text = typeof value === 'boolean' ? String(value) : p.text(`${at}.${name}`, value)
    if (text !== null) out.set(name, text)
  }
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

function readExpose(p: Problems, at: string, v: unknown): number[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > SERVICE_LIMITS.expose) return (p.add(at, 'badValue', 'expose is a short list of ports, such as [5432].'), [])
  const ports = new Set<number>()
  for (const item of v) {
    const m = /^(\d{1,5})(\/tcp)?$/.exec(String(item))
    const port = m ? Number(m[1]) : NaN
    if (!(port >= 1 && port <= 65535)) p.add(at, 'badValue', `${String(item)} is not a port; write it as a number, such as 5432.`)
    else ports.add(port)
  }
  return [...ports].sort((a, b) => a - b)
}

const HEALTH_LIMITS = { intervalMs: 300_000, timeoutMs: 300_000, startPeriodMs: 600_000, retries: 100 }

function readHealthcheck(p: Problems, at: string, v: unknown): ServiceHealthcheck | null {
  if (!isMap(v)) return p.add(at, 'badValue', 'healthcheck is a mapping with test, such as { test: [CMD, pg_isready] }.')
  for (const key of Object.keys(v)) {
    if (!['test', 'interval', 'timeout', 'retries', 'start_period', 'disable'].includes(key)) {
      p.add(`${at}.${key}`, 'notAllowed', `${key} is not accepted in a healthcheck.`)
    }
  }
  if (v.disable === true) return null
  let test: string[] | null = null
  if (typeof v.test === 'string') test = (s => (s === null ? null : ['CMD-SHELL', s]))(p.text(`${at}.test`, v.test))
  else if (Array.isArray(v.test) && ['CMD', 'CMD-SHELL'].includes(v.test[0] as string) && v.test.length >= 2) {
    const args = v.test.map((a, i) => p.text(`${at}.test[${i}]`, a, SERVICE_LIMITS.argChars))
    test = args.every(a => a !== null) && (v.test[0] === 'CMD' || v.test.length === 2) ? args as string[] : null
  }
  if (!test) return p.add(`${at}.test`, 'badValue', 'test is [CMD, program, args...], [CMD-SHELL, command] or a command.')
  const ms = (key: string, fallback: number, max: number) => {
    const value = v[key] === undefined ? fallback : readDuration(v[key])
    return value !== null && value <= max ? value : p.add(`${at}.${key}`, 'badValue', `${key} is a duration such as 10s, at most ${max / 1000}s.`)
  }
  const intervalMs = ms('interval', 30_000, HEALTH_LIMITS.intervalMs)
  const timeoutMs = ms('timeout', 30_000, HEALTH_LIMITS.timeoutMs)
  const startPeriodMs = ms('start_period', 0, HEALTH_LIMITS.startPeriodMs)
  const retries = v.retries === undefined ? 3 : v.retries
  if (!Number.isInteger(retries) || (retries as number) < 0 || (retries as number) > HEALTH_LIMITS.retries) {
    return p.add(`${at}.retries`, 'badValue', `retries is a whole number up to ${HEALTH_LIMITS.retries}.`)
  }
  if (intervalMs === null || timeoutMs === null || startPeriodMs === null) return null
  return { test, intervalMs, timeoutMs, retries: retries as number, startPeriodMs }
}

function readDependsOn(p: Problems, at: string, v: unknown): [string, DependsCondition][] {
  if (v === undefined) return []
  const out = new Map<string, DependsCondition>()
  if (Array.isArray(v)) {
    for (const s of v) typeof s === 'string' ? out.set(s, 'service_started') : p.add(at, 'badValue', 'depends_on lists service names.')
  } else if (isMap(v)) {
    for (const [s, c] of Object.entries(v)) {
      const condition = isMap(c) ? c.condition : undefined
      if (!isMap(c) || Object.keys(c).some(k => k !== 'condition')
        || !(DEPENDS_CONDITIONS as readonly unknown[]).includes(condition ?? 'service_started')) {
        p.add(`${at}.${s}`, 'badValue', `Each is { condition: ${DEPENDS_CONDITIONS.join(' | ')} }.`)
      } else out.set(s, (condition ?? 'service_started') as DependsCondition)
    }
  } else p.add(at, 'badValue', 'depends_on lists service names.')
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

function readServiceVolume(p: Problems, at: string, v: unknown, declared: Set<string>): ServiceDeclaration['volume'] {
  if (v === undefined) return null
  if (!Array.isArray(v)) return p.add(at, 'badValue', 'volumes lists one named volume, such as [data:/var/lib/postgresql/data].')
  if (v.length > 1) return p.add(at, 'oneVolume', 'A service mounts one named volume at most.')
  if (v.length === 0) return null
  const item = v[0]
  let source: unknown, target: unknown, readOnly = false
  if (typeof item === 'string') {
    const parts = item.split(':')
    if (parts.length === 3 && (parts[2] === 'ro' || parts[2] === 'rw')) readOnly = parts[2] === 'ro'
    else if (parts.length !== 2) return p.add(at, 'badValue', 'Write a volume as name:/path, such as data:/var/lib/postgresql/data.')
    ;[source, target] = parts
  } else if (isMap(item) && Object.keys(item).every(k => ['type', 'source', 'target', 'read_only'].includes(k))) {
    if (item.type !== 'volume') return p.add(at, 'hostPath', 'Only named volumes are mounted; files from the machine never are.')
    ;({ source, target } = item)
    readOnly = item.read_only === true
  } else return p.add(at, 'badValue', 'Write a volume as name:/path.')
  if (typeof source !== 'string' || /^[/.~]/.test(source) || source.includes('/')) {
    return p.add(at, 'hostPath', 'Only named volumes are mounted; files from the machine never are.')
  }
  if (!declared.has(source)) return p.add(at, 'unknownVolume', `Declare ${source} under volumes first, as ${source}: {}.`)
  if (typeof target !== 'string' || !target.startsWith('/') || target === '/' || target.length > 1024
    || target.split('/').slice(1).some(s => s === '' || s === '.' || s === '..') || /[\0\n\r]/.test(target)) {
    return p.add(at, 'badValue', 'Mount it at a full path inside the container, such as /var/lib/postgresql/data.')
  }
  return { name: source, target, readOnly }
}

function checkDepends(p: Problems, services: ServiceDeclaration[]): void {
  const byName = new Map(services.map(s => [s.name, s]))
  for (const s of services) {
    for (const [d] of s.dependsOn) {
      if (!byName.has(d)) p.add(`services.${s.name}.depends_on`, 'unknownService', `${d} is not a service in this file.`)
    }
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (name: string): boolean => {
    if (state.get(name) === 'done') return false
    if (state.get(name) === 'visiting') return true
    state.set(name, 'visiting')
    const cycle = (byName.get(name)?.dependsOn ?? []).some(([d]) => byName.has(d) && visit(d))
    state.set(name, 'done')
    return cycle
  }
  for (const s of services) {
    if (visit(s.name)) {
      p.add(`services.${s.name}.depends_on`, 'dependsCycle', 'depends_on goes round in a circle; a service cannot wait for itself.')
      return
    }
  }
}
