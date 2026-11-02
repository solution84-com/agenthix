/**
 * Which published package an installed copy is, before the rule's facts are looked up for it. A package's own
 * package.json can name any package, and a dependency can come from git, a URL or an alias under a well-known name,
 * so a copy is taken to be `name@version` only when its folder, its package.json and where the package manager says
 * it came from all agree that it is that version from the public registry. Anything else is judged as not checked.
 *
 * Yarn 1 records origins by name and version, not by folder, so its copies are taken only where Yarn itself puts the
 * one copy it hoists, `node_modules/<name>`: a folder another package's tarball carries cannot borrow a lock entry.
 *
 * A package of a scope the organisation trusts comes from the registry the project names for that scope, which can be
 * any; it skips only the check of which registry. It must still have been fetched from a registry, as a version
 * (`registryCopyIdentity`): never from git, a URL, a file or a link, which the project would have asked for somewhere.
 */
import type { ScannedPackage } from './scanScript'

const SEMVER = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,128})?(?:\+[0-9A-Za-z.-]{1,128})?$/

/** The public registry's addresses for a tarball; Yarn 1 writes the second. */
const REGISTRY_ORIGINS = ['https://registry.npmjs.org', 'https://registry.yarnpkg.com']

export type PackageIdentity = { name: string; version: string }

/** `https://registry.npmjs.org/<name>/-/<base>-<version>.tgz`, with an optional `#hash` Yarn adds. */
export function isRegistryTarball(resolved: string, name: string, version: string): boolean {
  const base = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
  const pathname = `/${name}/-/${base}-${version}.tgz`
  return REGISTRY_ORIGINS.some(origin => resolved === `${origin}${pathname}` || resolved.startsWith(`${origin}${pathname}#`))
}

/** pnpm's store folder for a registry version: `<name with + for />@<version>`, then nothing, or its peers. */
function isPnpmRegistryId(id: string, name: string, version: string): boolean {
  const prefix = `${name.replace('/', '+')}@${version}`
  return id === prefix || id.startsWith(`${prefix}_`) || id.startsWith(`${prefix}(`)
}

/**
 * A spec that asks a registry for a version: a range or a tag. Not a URL, git, GitHub shorthand, alias, file or link,
 * each of which has a colon or a slash, or starts with a dot (npm reads `.` and `..` as folders).
 */
export function isRegistrySpec(spec: string): boolean {
  return /^[0-9A-Za-z.\-+*^~<>=|\s]*$/.test(spec) && !spec.trimStart().startsWith('.')
}

/** An https address with no credentials in it, as a registry's tarball is; git, file and plain http are not. */
function isHttpsTarball(resolved: string): boolean {
  try {
    const u = new URL(resolved)
    return u.protocol === 'https:' && !u.username && !u.password
  } catch {
    return false
  }
}

const yarnHoisted = (pkg: ScannedPackage, name: string) => pkg.dir === `node_modules/${name}`
type Judged = { identity: PackageIdentity } | { unchecked: string }

function front(pkg: ScannedPackage): { name: string; version: string } | { unchecked: string } {
  const { name, version, folder } = pkg
  if (name !== folder) return { unchecked: `its folder is ${folder} but it says it is ${name ?? 'nothing'}` }
  if (!version || !SEMVER.test(version)) return { unchecked: 'it has no registry version' }
  return { name, version }
}

/** The package and version this copy is, or why it cannot be taken as one. */
export function packageIdentity(pkg: ScannedPackage): Judged {
  const f = front(pkg)
  if ('unchecked' in f) return f
  const { name, version } = f
  const { origin } = pkg
  const fromRegistry = (() => {
    switch (origin.kind) {
      case 'npm': return origin.version === version && origin.resolved !== null && isRegistryTarball(origin.resolved, name, version)
      case 'pnpm': return isPnpmRegistryId(origin.id, name, version)
      case 'yarn': return yarnHoisted(pkg, name) && origin.resolved.length > 0 && origin.resolved.every(r => isRegistryTarball(r, name, version))
      case 'none': return false
    }
  })()
  return fromRegistry ? { identity: { name, version } } : { unchecked: 'it was not installed from the public npm registry' }
}

/** For a trusted scope: this copy is the version fetched from whichever registry the project names, and asked for only as a version. */
export function registryCopyIdentity(pkg: ScannedPackage): Judged {
  const f = front(pkg)
  if ('unchecked' in f) return f
  const { name, version } = f
  const { origin, specs } = pkg
  const askedAsVersion = specs !== null && specs.length > 0 && specs.every(isRegistrySpec)
  const fetched = (() => {
    switch (origin.kind) {
      case 'npm': return askedAsVersion && origin.version === version && origin.resolved !== null && isHttpsTarball(origin.resolved)
      case 'pnpm': return isPnpmRegistryId(origin.id, name, version)
      case 'yarn': return askedAsVersion && yarnHoisted(pkg, name) && origin.resolved.length > 0 && origin.resolved.every(isHttpsTarball)
      case 'none': return false
    }
  })()
  return fetched ? { identity: { name, version } } : { unchecked: 'it was not fetched from a registry as a version' }
}
