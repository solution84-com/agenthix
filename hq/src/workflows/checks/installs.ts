/**
 * Installs in a version's code (R1 rules 4 and 5): which commands install software, and whether each is pinned —
 * from a lock file that is one of the version's files, or with a checksum — or pipes a download into a shell.
 */
import { argsOf, commandName, firstOperand, type CodeLine, type Segment } from './code'

export type Install = { at: CodeLine; what: string; pinned: boolean; pipedToShell: boolean }

/** A package manager's install, and the lock files that pin it. */
const LOCKED: Record<string, { verbs: string[]; bare?: true; locks: string[] }> = {
  npm: { verbs: ['ci', 'install', 'i', 'in', 'add', 'update', 'install-ci-test', 'install-test'], locks: ['package-lock.json', 'npm-shrinkwrap.json'] },
  yarn: { verbs: ['install', 'add'], bare: true, locks: ['yarn.lock'] },
  pnpm: { verbs: ['install', 'i', 'add', 'update'], locks: ['pnpm-lock.yaml'] },
  bun: { verbs: ['install', 'i', 'add'], locks: ['bun.lock', 'bun.lockb'] },
  composer: { verbs: ['install', 'require', 'update'], locks: ['composer.lock'] },
}
/** These name packages that no lock file among the version's files pins. */
const UNPINNED: Record<string, string[]> = {
  'apt-get': ['install'], apt: ['install'], apk: ['add'], dnf: ['install'], yum: ['install'], brew: ['install'],
  gem: ['install'], cargo: ['install'], go: ['install', 'get'], pipx: ['install'],
}
const PIP = new Set(['pip', 'pip3'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'python', 'python3', 'node', 'perl', 'ruby'])
const DOWNLOADERS = new Set(['curl', 'wget'])
/** A lockfile install that adds or changes packages isn't pinned by the lock it rewrites. */
const NAMES_PACKAGES = new Set(['add', 'require', 'update'])

function basenames(files: string[]): Set<string> {
  return new Set(files.map((f) => f.slice(f.lastIndexOf('/') + 1)))
}

function pipVerb(seg: Segment): boolean {
  const name = commandName(seg)
  const args = argsOf(seg).map((w) => w.text)
  if (PIP.has(name)) return args[0] === 'install'
  if (name === 'python' || name === 'python3') return args[0] === '-m' && PIP.has(args[1] ?? '') && args[2] === 'install'
  return false
}

function pipPinned(seg: Segment, texts: Map<string, string | null>): boolean {
  const args = argsOf(seg).map((w) => w.text)
  if (args.some((a) => a === '--require-hashes' || a.startsWith('--hash='))) return true
  const r = args.findIndex((a) => a === '-r' || a === '--requirement')
  const file = r >= 0 ? args[r + 1] : undefined
  if (!file) return false
  const normalised = file.replace(/^\.\//, '').replace(/^\/run\/workflow\//, '')
  return texts.get(normalised)?.includes('--hash=') ?? false
}

function installOf(seg: Segment, files: Set<string>, texts: Map<string, string | null>): { what: string; pinned: boolean } | null {
  const name = commandName(seg)
  const args = argsOf(seg)
  const verb = firstOperand(args)?.word.text
  const locked = LOCKED[name]
  if (locked && ((verb !== undefined && locked.verbs.includes(verb)) || (locked.bare && verb === undefined))) {
    const what = `${name} ${verb ?? 'install'}`
    const namesPackages = (verb !== undefined && NAMES_PACKAGES.has(verb))
      || ((verb === 'install' || verb === 'i' || verb === 'in') && args.filter((w) => !w.text.startsWith('-')).length > 1)
    return { what, pinned: !namesPackages && locked.locks.some((l) => files.has(l)) }
  }
  if (pipVerb(seg)) return { what: 'pip install', pinned: pipPinned(seg, texts) }
  const unpinned = UNPINNED[name]
  if (unpinned && verb !== undefined && unpinned.includes(verb)) return { what: `${name} ${verb}`, pinned: false }
  return null
}

export function findInstalls(lines: { at: CodeLine; segments: Segment[] }[], fileList: string[], texts: Map<string, string | null>): Install[] {
  const files = basenames(fileList)
  const out: Install[] = []
  for (const { at, segments } of lines) {
    segments.forEach((seg, i) => {
      const next = segments[i + 1]
      if (DOWNLOADERS.has(commandName(seg)) && seg.pipedOut && next && SHELLS.has(commandName(next))) {
        out.push({ at, what: `${commandName(seg)} … | ${commandName(next)}`, pinned: false, pipedToShell: true })
        return
      }
      const install = installOf(seg, files, texts)
      if (install) out.push({ at, ...install, pipedToShell: false })
    })
  }
  return out
}
