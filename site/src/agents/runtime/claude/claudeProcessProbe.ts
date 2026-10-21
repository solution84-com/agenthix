/**
 * Finding a conversation's own `claude` process in its container: to read its
 * memory at the start of a turn (spec §1, the memory ceiling), and to make
 * sure it is gone before a replacement resumes the same session file.
 *
 * The process is the one carrying the conversation's tag whose parent is
 * outside the container (PPid 0) — which only a process started by
 * `docker exec` has — and whose name is `claude`. Commands it starts carry the
 * tag too, but their parent is inside the container; a background process
 * that outlives its parent is re-parented to the container's init, not to 0.
 *
 * Runs as the image's user, the default for `docker exec`: root in these
 * containers cannot read another user's process environment.
 */
import { spawn } from 'node:child_process'
import { CONVERSATION_PROCESS_TAG } from '@agenthix/core'
import { AGENT_IMAGE_USER } from '../harnessHomes'
import { conversationProcessTag } from '../conversationProcesses'
import { dockerWithin } from '../containerLifecycle'
import { positiveNumberEnv } from '../containerLimits'

/** The ceiling above which a `claude` process is replaced at its next turn (spec §1). */
export function harnessMemoryCeilingMb(): number {
  return positiveNumberEnv('AGENT_HARNESS_MEMORY_MB', 1024)
}

export const CLAUDE_PROCESS_SCRIPT = [
  'id=$1; mode=$2',
  'for f in /proc/[0-9]*/environ; do',
  `  grep -q -a -x -F "${CONVERSATION_PROCESS_TAG}=$id" "$f" 2>/dev/null || continue`,
  '  d=${f%/environ}',
  '  [ "$(sed -n "s/^PPid:[[:space:]]*//p" "$d/status" 2>/dev/null)" = 0 ] || continue',
  '  [ "$(cat "$d/comm" 2>/dev/null)" = claude ] || continue',
  '  if [ "$mode" = kill ]; then kill -KILL "${d#/proc/}" 2>/dev/null; echo "killed ${d#/proc/}"',
  '  else echo "rss $(sed -n "s/^VmRSS:[[:space:]]*\\([0-9]*\\).*/\\1/p" "$d/status")"; fi',
  'done',
].join('\n')

const PROBE_TIMEOUT_MS = 5000

export function claudeProcessProbeArgs(containerName: string, conversationId: string, mode: 'rss' | 'kill'): string[] {
  conversationProcessTag(conversationId)
  return ['exec', '-u', AGENT_IMAGE_USER, containerName, 'sh', '-c', CLAUDE_PROCESS_SCRIPT, 'agenthix-claude-process', conversationId, mode]
}

/** Resident memory in MB of the conversation's `claude` process, or null when it cannot be read. */
export async function claudeProcessMemoryMb(
  where: { containerName: string; conversationId: string } | { pid: number },
): Promise<number | null> {
  try {
    if ('pid' in where) return await localRssMb(where.pid)
    const { stdout } = await dockerWithin(claudeProcessProbeArgs(where.containerName, where.conversationId, 'rss'), PROBE_TIMEOUT_MS)
    const kb = stdout.split('\n').map(l => /^rss (\d+)$/.exec(l.trim())?.[1]).filter(Boolean).map(Number)
    return kb.length ? Math.max(...kb) / 1024 : null
  } catch {
    return null
  }
}

/** Kills the conversation's `claude` process in its container, if one is still there. Never throws. */
export async function killClaudeProcess(containerName: string, conversationId: string): Promise<number> {
  try {
    const { stdout } = await dockerWithin(claudeProcessProbeArgs(containerName, conversationId, 'kill'), PROBE_TIMEOUT_MS)
    return stdout.split('\n').filter(l => l.startsWith('killed ')).length
  } catch {
    return 0
  }
}

function localRssMb(pid: number): Promise<number | null> {
  return new Promise(resolve => {
    const ps = spawn('ps', ['-o', 'rss=', '-p', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    ps.stdout.on('data', d => { out += String(d) })
    ps.on('error', () => resolve(null))
    ps.on('close', () => {
      const kb = Number(out.trim())
      resolve(Number.isFinite(kb) && kb > 0 ? kb / 1024 : null)
    })
  })
}
