// What a release finds broken since the previous one, by comparing what the previous tag held with what the tree
// holds now. Each break names the files whose commits must explain it: one of the commits since the tag that change
// one of those files must be marked breaking (./commits.mjs). `before(path)` and `now(path)` return a file's text, or
// null where it does not exist.
import { dataLosses, describeLoss } from '../../migration-check/narrowing.mjs'

/** The protocol shape snapshots (docs/architecture/versioning.md, *The shape snapshot*). */
export const PROTOCOL_SNAPSHOTS = ['site', 'host', 'client', 'cloud', 'relay'].map((name) => `core/snapshot/${name}.json`)

/** The release's surface snapshots: each a list of entries, where a removed entry is a break and an added one is not. */
export const SURFACE_SNAPSHOTS = [
  { file: 'core/snapshot/exports.json', what: "core's exported name" },
  { file: 'host/snapshot/cli.json', what: 'the agenthix command or option' },
  { file: 'host/snapshot/settings.json', what: "the host service's start-up setting" },
  { file: 'host/snapshot/names.json', what: 'the installation name' },
]

const constant = (name) => new RegExp(String.raw`(?:^|\n)(?:export\s+)?const\s+${name}\s*=\s*(\d+|'[^']*')`)

/** The numbers of the stored and exchanged formats (versioning.md, *Stored data*). */
export const FORMATS = [
  { name: "an agent package's contents (PACKAGE_FORMAT_VERSION)", file: 'core/src/protocol/packages.ts', pattern: constant('PACKAGE_FORMAT_VERSION') },
  { name: "a Library asset's manifest (ASSET_MANIFEST_FORMAT)", file: 'core/src/assets/manifest.ts', pattern: constant('ASSET_MANIFEST_FORMAT') },
  { name: "the host service's envelopes (HOST_ENVELOPE_VERSION)", file: 'core/src/host/envelope.ts', pattern: constant('HOST_ENVELOPE_VERSION') },
  { name: "a moved hq's address check (MOVE_CHECK_VERSION)", file: 'core/src/host/moveCheck.ts', pattern: constant('MOVE_CHECK_VERSION') },
  { name: "a workflow version's hash (WORKFLOW_VERSION_FORMAT)", file: 'core/src/workflows/versionHash.ts', pattern: constant('WORKFLOW_VERSION_FORMAT') },
  { name: "a sealed backup's header (format)", file: 'host/src/backups/seal.ts', pattern: /\n\s*format: (\d+)\n/ },
  { name: "a Library package's manifest (PACKAGE_FORMAT)", file: 'hq/src/library/packages/packageManifest.ts', pattern: constant('PACKAGE_FORMAT') },
  { name: "a stored secret's encryption (BOUND_FORMAT)", file: 'hq/src/server/crypto/secretCrypto.ts', pattern: constant('BOUND_FORMAT') },
  { name: "a generated picture's recipe (RECIPE_FORMAT_VERSION)", file: 'hq/src/shared/pictures/recipe.ts', pattern: constant('RECIPE_FORMAT_VERSION') },
]

export function formatNumber(format, text) {
  return text?.match(format.pattern)?.[1] ?? null
}

const major = (version) => Number(String(version).split('.')[0])

export function protocolBreaks(before, now) {
  return PROTOCOL_SNAPSHOTS.flatMap((file) => {
    const [was, is] = [before(file), now(file)].map((text) => (text ? JSON.parse(text) : null))
    if (!was || !is || major(was.version) === major(is.version)) return []
    return [{ what: `the ${is.connection} protocol's major moved, ${was.version} to ${is.version}`, files: [file] }]
  })
}

export function formatBreaks(before, now) {
  return FORMATS.flatMap((format) => {
    const was = formatNumber(format, before(format.file))
    const is = formatNumber(format, now(format.file))
    return was !== null && is !== null && was !== is ? [{ what: `the format of ${format.name} moved, ${was} to ${is}`, files: [format.file] }] : []
  })
}

export function surfaceBreaks(before, now) {
  return SURFACE_SNAPSHOTS.flatMap(({ file, what }) => {
    const was = before(file)
    const is = now(file)
    if (!was || !is) return []
    const kept = new Set(JSON.parse(is).entries)
    return JSON.parse(was).entries.filter((entry) => !kept.has(entry)).map((entry) => ({ what: `${what} \`${entry}\` was removed`, files: [file] }))
  })
}

/** `migrations` are the migration files added since the tag. */
export function migrationBreaks(migrations, now) {
  return migrations.flatMap((file) => dataLosses(now(file) ?? '').map((loss) => ({ what: describeLoss(file, loss), files: [file] })))
}
