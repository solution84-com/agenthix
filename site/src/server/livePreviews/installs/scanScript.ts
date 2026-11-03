/**
 * Finding the installed packages that have install scripts. The site never reads a folder a live preview can write,
 * so the walk runs in the live preview's container, through the launcher, as `node -e SCAN_SCRIPT <project>`; what it prints
 * is the live preview's word and is read here as hostile input.
 *
 * The walk takes real folders only, never a link, so pnpm's links into `.pnpm` are not counted twice and no link
 * leads it out of the project. For each package it reports where it came from as the package manager recorded it:
 * npm's hidden lockfile entry, pnpm's store folder, or Yarn 1's `yarn.lock` entries for that name and version; and
 * every way the project asks for that name (`specs`): each dependent's range in npm's lockfile or Yarn's, the project's
 * own package.json, and its overrides and resolutions. A copy fetched from git, a URL, a file or a link is asked for so
 * somewhere among them.
 */
import { isNpmPackageName } from '@agenthix/core'
import { isPackageDir } from './installCommand'

export const SCAN_TIMEOUT_MS = 2 * 60 * 1000
const MAX_REPORTED = 2000

export const SCAN_SCRIPT = String.raw`
const fs = require('fs'), path = require('path');
const root = process.argv[1];
const MAX_PKGS = 20000, MAX_OUT = ${MAX_REPORTED}, MAX_DEPTH = 40, MAX_LOCK = 64 * 1024 * 1024;
let seen = 0, truncated = false;
const out = [];
const stat = p => { try { return fs.lstatSync(p) } catch { return null } };
const isDir = p => { const s = stat(p); return !!s && s.isDirectory() };
const isFile = p => { const s = stat(p); return !!s && s.isFile() };
const readJson = (p, max) => { const s = stat(p); if (!s || !s.isFile() || s.size > max) return null; try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } };
const list = p => { try { return fs.readdirSync(p).sort() } catch { return [] } };
const npmLock = readJson(path.join(root, 'node_modules', '.package-lock.json'), MAX_LOCK);
const npmPackages = npmLock && typeof npmLock.packages === 'object' && npmLock.packages ? npmLock.packages : null;
let yarnLock = null;
{ const p = path.join(root, 'yarn.lock'); const s = stat(p); if (s && s.isFile() && s.size <= MAX_LOCK) { try { yarnLock = fs.readFileSync(p, 'utf8') } catch {} } }
function yarnOrigins(name, version) {
  if (yarnLock === null) return null;
  const found = [];
  for (const block of yarnLock.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(l => l && !l.startsWith('#'));
    if (!lines.length || lines[0].startsWith(' ')) continue;
    const specs = lines[0].replace(/:$/, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const named = specs.some(s => { const at = s.indexOf('@', s.startsWith('@') ? 1 : 0); return at > 0 && s.slice(0, at) === name });
    if (!named) continue;
    const v = lines.find(l => /^\s+version /.test(l));
    if (!v || v.trim().replace(/^version\s+"?|"?$/g, '') !== version) continue;
    const r = lines.find(l => /^\s+resolved /.test(l));
    found.push(r ? r.trim().replace(/^resolved\s+"?|"?$/g, '') : '');
  }
  return found;
}
const rootPkg = readJson(path.join(root, 'package.json'), 1024 * 1024);
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// An override's key may name the package in several forms (name@range, a>name, **/name); any key that holds the
// name counts, which at worst counts a spec of another package's too.
function overrideSpecs(o, name, into, depth) {
  if (!o || typeof o !== 'object' || depth > 20) return;
  for (const [k, v] of Object.entries(o)) {
    const hits = k.includes(name);
    if (typeof v === 'string') { if (hits) into.push(v) }
    else if (v && typeof v === 'object') { if (hits && typeof v['.'] === 'string') into.push(v['.']); overrideSpecs(v, name, into, depth + 1) }
  }
}
function specsFor(name) {
  const into = [];
  if (typeof name !== 'string') return into;
  const fromDeps = e => { if (!e || typeof e !== 'object') return; for (const f of DEP_FIELDS) { const d = e[f]; if (d && typeof d === 'object' && typeof d[name] === 'string') into.push(d[name]) } };
  fromDeps(rootPkg);
  if (rootPkg && typeof rootPkg === 'object') { overrideSpecs(rootPkg.overrides, name, into, 0); overrideSpecs(rootPkg.resolutions, name, into, 0); overrideSpecs(rootPkg.pnpm && rootPkg.pnpm.overrides, name, into, 0) }
  if (npmPackages) for (const e of Object.values(npmPackages)) fromDeps(e);
  if (yarnLock !== null) for (const block of yarnLock.split(/\n\s*\n/)) {
    const first = block.split('\n').find(l => l && !l.startsWith('#'));
    if (!first || first.startsWith(' ')) continue;
    for (const s of first.replace(/:$/, '').split(',').map(x => x.trim().replace(/^"|"$/g, ''))) {
      const at = s.indexOf('@', s.startsWith('@') ? 1 : 0);
      if (at > 0 && s.slice(0, at) === name) into.push(s.slice(at + 1));
    }
  }
  return into;
}
function origin(rel, name, version) {
  const parts = rel.split('/');
  const pnpm = parts[0] === 'node_modules' && parts[1] === '.pnpm' ? parts[2] : null;
  if (pnpm) return { kind: 'pnpm', id: pnpm };
  if (npmPackages) { const e = npmPackages[rel]; return { kind: 'npm', resolved: e && typeof e.resolved === 'string' ? e.resolved : null, version: e && typeof e.version === 'string' ? e.version : null } }
  const y = typeof name === 'string' && typeof version === 'string' ? yarnOrigins(name, version) : null;
  if (y !== null) return { kind: 'yarn', resolved: y };
  return { kind: 'none' };
}
function visitPackage(dir, folder, depth) {
  if (++seen > MAX_PKGS) { truncated = true; return }
  const pkg = readJson(path.join(dir, 'package.json'), 1024 * 1024);
  if (pkg && typeof pkg === 'object') {
    const s = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    const scripts = ['preinstall', 'install', 'postinstall'].filter(k => typeof s[k] === 'string' && s[k].trim());
    const gyp = !scripts.includes('install') && !scripts.includes('preinstall') && isFile(path.join(dir, 'binding.gyp'));
    if (scripts.length || gyp) {
      if (out.length >= MAX_OUT) truncated = true;
      else { const rel = path.relative(root, dir).split(path.sep).join('/'); out.push({ dir: rel, folder, name: pkg.name, version: pkg.version, scripts, gyp, origin: origin(rel, pkg.name, pkg.version), specs: specsFor(pkg.name) }) }
    }
  }
  visitModules(path.join(dir, 'node_modules'), depth + 1);
}
function visitModules(nm, depth) {
  if (depth > MAX_DEPTH || !isDir(nm)) return;
  for (const e of list(nm)) {
    const p = path.join(nm, e);
    if (e === '.pnpm') { if (isDir(p)) for (const id of list(p)) visitModules(path.join(p, id, 'node_modules'), depth + 1); continue }
    if (e.startsWith('.')) continue;
    if (e.startsWith('@')) { if (isDir(p)) for (const n of list(p)) { const q = path.join(p, n); if (isDir(q)) visitPackage(q, e + '/' + n, depth) } continue }
    if (isDir(p)) visitPackage(p, e, depth);
  }
}
visitModules(path.join(root, 'node_modules'), 0);
process.stdout.write(JSON.stringify({ pnp: isFile(path.join(root, '.pnp.cjs')), truncated, packages: out }));
`

export type PackageOrigin =
  | { kind: 'npm'; resolved: string | null; version: string | null }
  | { kind: 'pnpm'; id: string }
  | { kind: 'yarn'; resolved: string[] }
  | { kind: 'none' }

/** One installed copy of a package with install scripts, as the live preview reported it. */
export type ScannedPackage = {
  dir: string
  /** The name its folder gives it, which is what code that requires it gets. */
  folder: string
  /** What its own package.json says; checked against `folder` and the origin before anything trusts it. */
  name: string | null
  version: string | null
  scripts: string[]
  gyp: boolean
  origin: PackageOrigin
  /** Every way the project asks for this name; null when there were too many to report. */
  specs: string[] | null
}

export type ScanResult = { pnp: boolean; truncated: boolean; packages: ScannedPackage[] }

const SCRIPTS = new Set(['preinstall', 'install', 'postinstall'])
const MAX_SPECS = 256
const str = (v: unknown, max = 2048): string | null => (typeof v === 'string' && v.length <= max ? v : null)

function readOrigin(v: unknown): PackageOrigin {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {}
  if (o.kind === 'npm') return { kind: 'npm', resolved: str(o.resolved), version: str(o.version, 256) }
  if (o.kind === 'pnpm' && str(o.id, 512)) return { kind: 'pnpm', id: o.id as string }
  if (o.kind === 'yarn' && Array.isArray(o.resolved)) return { kind: 'yarn', resolved: o.resolved.slice(0, 64).map(r => str(r) ?? '') }
  return { kind: 'none' }
}

function readSpecs(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_SPECS) return null
  const specs = v.map(x => str(x))
  return specs.every((x): x is string => x !== null) ? specs : null
}

/** The walk's output, read field by field; an entry that is not one is dropped, since nothing then runs for it. */
export function readScan(stdout: string): ScanResult | null {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { packages?: unknown }).packages)) return null
  const r = raw as { pnp?: unknown; truncated?: unknown; packages: unknown[] }
  const packages: ScannedPackage[] = []
  for (const item of r.packages.slice(0, MAX_REPORTED)) {
    const p = item && typeof item === 'object' ? item as Record<string, unknown> : null
    if (!p || !isPackageDir(p.dir) || !isNpmPackageName(p.folder) || !Array.isArray(p.scripts)) continue
    packages.push({
      dir: p.dir,
      folder: p.folder,
      name: str(p.name, 214),
      version: str(p.version, 256),
      scripts: p.scripts.filter((s): s is string => typeof s === 'string' && SCRIPTS.has(s)),
      gyp: p.gyp === true,
      origin: readOrigin(p.origin),
      specs: readSpecs(p.specs),
    })
  }
  return { pnp: r.pnp === true, truncated: r.truncated === true || r.packages.length > MAX_REPORTED, packages }
}
