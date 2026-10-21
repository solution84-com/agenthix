/**
 * Which declarations make up each connection, and where its committed snapshot lives.
 *
 * The site, host and Cloud connections are what their entry module exports, so the shapes their entry publishes are
 * the contract. The site's entry includes its method maps (`SiteMethods`, `SiteContentMethods`, `SiteEvents`) and the
 * host's its console link's (`ConsoleLinkMethods`), so every method's params and result are recorded with it. The client connection is the mobile app's own list (mobileApp.ts) and the
 * version handshake beside it (protocol.ts): the client entry also exports what only hq's web pages use, and the
 * spec makes the list the boundary.
 *
 * When a major moves and a previous major's code is kept for peers one major behind, its modules go in
 * `previousMajor`, so the test can see a deprecated thing that must by then be gone.
 */
import ts from 'typescript'
import type { ConnectionSource } from './extract.js'
import type { Snapshot } from './shape.js'

export type Connection = ConnectionSource & { previousMajor: string[] }

export const CONNECTIONS: Connection[] = [
  {
    name: 'site',
    modules: ['protocol/index.ts'],
    version: 'protocol/connection.ts#SITE_PROTOCOL_VERSION',
    previousMajor: [],
  },
  {
    name: 'host',
    modules: ['host/index.ts'],
    version: 'host/relay.ts#HOST_PROTOCOL_VERSION',
    previousMajor: [],
  },
  {
    name: 'client',
    modules: ['client/protocol.ts', 'client/mobileApp.ts'],
    constants: ['client/mobileApp.ts#MOBILE_HTTP_ROUTES'],
    version: 'client/protocol.ts#CLIENT_PROTOCOL_VERSION',
    previousMajor: [],
  },
  {
    name: 'cloud',
    modules: ['cloud/index.ts'],
    version: 'cloud/version.ts#CLOUD_PROTOCOL_VERSION',
    previousMajor: [],
  },
]

// Core has no Node type declarations, so files are reached through the compiler's own `ts.sys`, from this module's
// own address (a `file:` URL under vitest).
const here = decodeURIComponent((import.meta as { url?: string }).url!.replace(/^file:\/\//, '')).replace(/\/[^/]*$/, '')
export const CORE_SRC = ts.sys.resolvePath(`${here}/../..`)
export const SNAPSHOT_DIR = ts.sys.resolvePath(`${CORE_SRC}/../snapshot`)

export function snapshotPath(connection: string): string {
  return `${SNAPSHOT_DIR}/${connection}.json`
}

export function readSnapshot(connection: string): Snapshot | null {
  const text = ts.sys.readFile(snapshotPath(connection))
  return text === undefined ? null : (JSON.parse(text) as Snapshot)
}

export function writeSnapshot(snapshot: Snapshot): void {
  ts.sys.writeFile(snapshotPath(snapshot.connection), `${stringify(snapshot, '')}\n`)
}

/** JSON with each value on one line where it fits, so a field reads as one line and a change to it diffs as one. */
function stringify(value: unknown, indent: string): string {
  const flat = JSON.stringify(value)
  if (flat.length + indent.length <= 118 || value === null || typeof value !== 'object') return flat
  const inner = `${indent}  `
  if (Array.isArray(value)) return `[\n${value.map(v => inner + stringify(v, inner)).join(',\n')}\n${indent}]`
  const items = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringify(v, inner)}`)
  return `{\n${items.join(',\n')}\n${indent}}`
}

/** One program over core's sources, the way core's own build reads them. */
export function coreProgram(): ts.Program {
  const coreDir = ts.sys.resolvePath(`${CORE_SRC}/..`)
  const config = ts.readConfigFile(`${coreDir}/tsconfig.json`, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, coreDir)
  const roots = parsed.fileNames.filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts'))
  return ts.createProgram(roots, { ...parsed.options, noEmit: true })
}
