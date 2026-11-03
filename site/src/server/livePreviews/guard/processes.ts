/**
 * What runs and listens inside a live preview's container, read from the kernel's own `/proc` in one `sh` script the
 * site runs there (outside the launcher, which would hide other processes), and how the guard tells the live
 * preview's own processes from anything else.
 *
 * Processes are told apart by where they hang in the process tree, never by the command they show, which a process
 * can rewrite. PID 1 is Docker's init and its first child the container's own command; every `docker exec` starts a
 * tree whose root has parent 0; a process that leaves its parent is taken in by PID 1. No agent runs in a live
 * preview's container (the agent works from its project's container), so every tree is one the site started: an
 * app's, the forwarder's, an install's, or the guard's own look. Anything else is no one's.
 */

export type ProcessPrivilege = { uids: number[]; gids: number[]; capPrm: string; capEff: string; noNewPrivs: boolean }

export type PreviewProcess = {
  pid: number; ppid: number; state: string; startedAt: number; command: string
  privilege?: ProcessPrivilege
}

export type PreviewSnapshot = {
  self: number
  processes: PreviewProcess[]
  /** TCP ports listening on an address other than loopback, and those on loopback only. */
  listening: { open: number[]; loopback: number[] }
}

export const GUARD_SCRIPT_NAME = 'live-preview-snapshot'

// Newlines go from both files so a process cannot hide a line of its own in its name or arguments.
export const SNAPSHOT_SCRIPT = [
  'echo "self $$"',
  'for d in /proc/[0-9]*; do',
  '  s=$(tr "\\n" " " < "$d/stat" 2>/dev/null) || continue',
  '  [ -n "$s" ] || continue',
  '  c=$(tr "\\000\\n" "  " < "$d/cmdline" 2>/dev/null | cut -c1-300)',
  '  echo "P $s"',
  '  echo "C $c"',
  '  u=$(grep -E "^(Uid|Gid|CapPrm|CapEff|NoNewPrivs):" "$d/status" 2>/dev/null | tr -s "\\t\\n" "  ")',
  '  echo "U $u"',
  'done',
  'echo NET',
  'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null',
  'echo END',
].join('\n')

export const snapshotArgv = (): string[] => ['sh', '-c', SNAPSHOT_SCRIPT, GUARD_SCRIPT_NAME]

/** A `/proc/<pid>/stat` line: the name sits in the last parentheses, so it is cut at the last `)`. */
export function readStat(line: string): Omit<PreviewProcess, 'command'> | null {
  const open = line.indexOf(' (')
  const close = line.lastIndexOf(')')
  if (open < 0 || close < open) return null
  const pid = Number(line.slice(0, open))
  const rest = line.slice(close + 2).trim().split(/\s+/)
  const ppid = Number(rest[1])
  const startedAt = Number(rest[19])
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ppid) || ppid < 0) return null
  return { pid, ppid, state: rest[0] ?? '', startedAt: Number.isFinite(startedAt) ? startedAt : 0 }
}

const LISTEN = '0A'
const LOOPBACK_V4 = /^[0-9A-F]{6}7F$/i
const LOOPBACK_V6 = /^0{24}01000000$/i

function readTcp(lines: string[]): PreviewSnapshot['listening'] {
  const open = new Set<number>()
  const loopback = new Set<number>()
  for (const line of lines) {
    const fields = line.trim().split(/\s+/)
    if (fields[3] !== LISTEN) continue
    const [address = '', portHex = ''] = (fields[1] ?? '').split(':')
    const port = Number.parseInt(portHex, 16)
    if (!Number.isInteger(port)) continue
    if (LOOPBACK_V4.test(address) || LOOPBACK_V6.test(address)) loopback.add(port)
    else open.add(port)
  }
  for (const p of open) loopback.delete(p)
  return { open: [...open].sort((a, b) => a - b), loopback: [...loopback].sort((a, b) => a - b) }
}

/** A `U` line: `Uid: r e s f Gid: r e s f CapPrm: x CapEff: x NoNewPrivs: n`; null when any part is missing. */
export function readPrivilege(line: string): ProcessPrivilege | null {
  const field = (name: string) => new RegExp(`(?:^|\\s)${name}:\\s+([^:]*?)(?=\\s+[A-Za-z]+:|\\s*$)`).exec(line)?.[1]?.trim().split(/\s+/) ?? []
  const ids = (name: string) => field(name).map(Number)
  const uids = ids('Uid'), gids = ids('Gid')
  const [capPrm] = field('CapPrm'), [capEff] = field('CapEff'), [nnp] = field('NoNewPrivs')
  const hex = /^[0-9a-f]{1,32}$/i
  if (uids.length !== 4 || gids.length !== 4 || ![...uids, ...gids].every(n => Number.isInteger(n) && n >= 0)) return null
  if (!capPrm || !capEff || !hex.test(capPrm) || !hex.test(capEff) || (nnp !== '0' && nnp !== '1')) return null
  return { uids, gids, capPrm, capEff, noNewPrivs: nnp === '1' }
}

/**
 * *privilegeChange*, as the kernel shows it: a process running as anyone but the image's user, holding a capability,
 * or free to gain privileges. The container is made with neither, so no process holds one unless something got past.
 */
export function privilegedProcesses(snapshot: PreviewSnapshot, user: string): { process: PreviewProcess; why: string }[] {
  const [uid, gid] = user.split(':').map(Number)
  const out: { process: PreviewProcess; why: string }[] = []
  for (const p of snapshot.processes) {
    const v = p.privilege
    if (!v || p.state === 'Z') continue
    const why = v.uids.some(u => u !== uid) ? `runs as user ${v.uids.find(u => u !== uid)}`
      : gid !== undefined && Number.isInteger(gid) && v.gids.some(g => g !== gid) ? `runs as group ${v.gids.find(g => g !== gid)}`
      : /[1-9a-f]/i.test(v.capPrm) || /[1-9a-f]/i.test(v.capEff) ? 'holds capabilities'
      : !v.noNewPrivs ? 'may gain privileges'
      : null
    if (why) out.push({ process: p, why })
  }
  return out
}

/** The script's answer; null when it is not one (it did not end, or names no PID 1), which counts as a failed look. */
export function readSnapshot(stdout: string): PreviewSnapshot | null {
  const lines = stdout.split('\n')
  const self = Number(/^self (\d+)$/.exec(lines[0]?.trim() ?? '')?.[1])
  const net = lines.indexOf('NET')
  const end = lines.lastIndexOf('END')
  if (!Number.isInteger(self) || net < 0 || end < net) return null
  const processes: PreviewProcess[] = []
  for (let i = 1; i < net; i++) {
    const line = lines[i] ?? ''
    if (!line.startsWith('P ')) continue
    const stat = readStat(line.slice(2))
    const next = lines[i + 1] ?? '', third = lines[i + 2] ?? ''
    const command = next.startsWith('C ') ? next.slice(2).trim() : ''
    const privilege = third.startsWith('U ') ? readPrivilege(third.slice(2)) : null
    if (stat) processes.push({ ...stat, command, ...(privilege ? { privilege } : {}) })
  }
  if (!processes.some(p => p.pid === 1)) return null
  return { self, processes, listening: readTcp(lines.slice(net + 1, end)) }
}

/** The container's own command: the first child PID 1 took. */
export function containerCommandPid(snapshot: PreviewSnapshot): number | null {
  const children = snapshot.processes.filter(p => p.ppid === 1).sort((a, b) => a.startedAt - b.startedAt || a.pid - b.pid)
  return children[0]?.pid ?? null
}

/** `pid` and everything under it. */
export function treeOf(snapshot: PreviewSnapshot, pid: number): number[] {
  const out = [pid]
  for (let i = 0; i < out.length; i++) {
    for (const p of snapshot.processes) if (p.ppid === out[i] && !out.includes(p.pid)) out.push(p.pid)
  }
  return out
}

function rootOf(snapshot: PreviewSnapshot, pid: number): number {
  const parents = new Map(snapshot.processes.map(p => [p.pid, p.ppid]))
  let at = pid
  for (let hops = 0; hops < 4096; hops++) {
    const parent = parents.get(at)
    if (parent === undefined || parent === 0 || parent === 1) return at
    at = parent
  }
  return at
}

export type ProcessContext = {
  /** The top processes the site started and keeps: the apps' and the forwarder's. Everything under each is spared. */
  spared: ReadonlySet<number>
  /** A command of the site's own (an install, a stop) is going now, so a short-lived exec tree is expected. */
  siteExecGoing: boolean
}

/**
 * The roots of the trees that are no one's: a process taken in by PID 1 (it slipped out of whatever started it), and
 * an exec tree that is neither spared nor the guard's own look, unless the site has a command going.
 */
export function unexpectedProcesses(snapshot: PreviewSnapshot, ctx: ProcessContext): PreviewProcess[] {
  const own = new Set(treeOf(snapshot, rootOf(snapshot, snapshot.self)))
  const command = containerCommandPid(snapshot)
  return snapshot.processes.filter(p => {
    if (p.pid === 1 || p.pid === command || own.has(p.pid) || ctx.spared.has(p.pid) || p.state === 'Z') return false
    if (p.ppid === 1) return true
    return p.ppid === 0 && !ctx.siteExecGoing
  })
}

/**
 * Freezes the given processes and everything under them, then kills them all, in passes until none is left. It runs
 * outside the launcher, whose sandbox keeps signals in. It reads only `/proc` and sends only signals.
 */
export const KILL_SCRIPT_NAME = 'live-preview-kill'
export const KILL_SCRIPT = [
  'sel="$*"; self=$$',
  'ppid_of() { sed -n "s/.*) [A-Za-z] \\([0-9]*\\) .*/\\1/p" "/proc/$1/stat" 2>/dev/null; }',
  'kill -STOP $sel 2>/dev/null',
  'while :; do',
  '  new=""',
  '  for d in /proc/[0-9]*; do',
  '    p=${d#/proc/}',
  '    [ "$p" = "$self" ] && continue',
  '    case " $sel " in *" $p "*) continue ;; esac',
  '    pp=$(ppid_of "$p")',
  '    case " $sel " in *" $pp "*) new="$new $p" ;; esac',
  '  done',
  '  [ -z "$new" ] && break',
  '  kill -STOP $new 2>/dev/null',
  '  sel="$sel$new"',
  'done',
  'kill -KILL $sel 2>/dev/null',
  'echo "killed $sel"',
].join('\n')

export function killArgv(pids: number[]): string[] {
  return ['sh', '-c', KILL_SCRIPT, KILL_SCRIPT_NAME, ...pids.filter(p => Number.isInteger(p) && p > 1).map(String)]
}
