/**
 * Finding and ending the processes a conversation started in a container
 * (adr-0083, spec §3) — the one way it is done.
 *
 * Every process a conversation starts carries its tag
 * (`SITE_SESSION=<conversation id>`, core's `CONVERSATION_PROCESS_TAG`),
 * and everything those start inherits it, through `nohup`, `setsid` and a
 * double fork alike. One pass reads every process's environment in the
 * container for that exact entry, so one id is never taken for another it
 * prefixes; the matches are frozen (`SIGSTOP`) so they cannot fork while they
 * are killed, then killed; and passes repeat until one finds none, up to a
 * limit. A fork loop of about 1,500 processes cleared in two passes in the
 * phase 3 run, with other conversations untouched.
 *
 * It runs as the image's user: root in these containers has no
 * `CAP_SYS_PTRACE` and cannot read another user's process environment, so as
 * root the search would find nothing and report success. And it needs the
 * container to reap (`docker run --init`): killed processes otherwise stay as
 * zombies against the process limit.
 *
 * What it cannot find: a process started with its environment cleared
 * (`env -i`, `env -u SITE_SESSION`) loses the tag and is left running,
 * bounded by the container's limits and its idle removal (adr-0083's risk).
 */
import { CONVERSATION_PROCESS_TAG, isTaggableConversationId } from '@agenthix/core'
import { dockerWithin } from './containerLifecycle'
import { AGENT_IMAGE_USER } from './harnessHomes'

export { CONVERSATION_PROCESS_TAG }

export const END_PROCESSES_MAX_PASSES = 50
export const END_PROCESSES_TIMEOUT_MS = 15_000

/**
 * Busybox `sh`, with the id and the pass limit as `$1` and `$2`, never inside
 * the script. Busybox `grep` treats each NUL-separated variable in `environ`
 * as a line, so `-a -x -F` is one exact, literal match of the whole entry. The
 * search's own shell and its parent are left out; neither carries the tag.
 */
export const END_PROCESSES_SCRIPT = [
  'id=$1; max=$2; self=$$; n=0',
  'while :; do',
  `  pids=$(grep -l -a -x -F "${CONVERSATION_PROCESS_TAG}=$id" /proc/[0-9]*/environ 2>/dev/null | sed 's#^/proc/\\([0-9]*\\)/environ$#\\1#' | grep -v -x -e "$self" -e "$PPID")`,
  '  [ -z "$pids" ] && { echo "cleared $n"; exit 0; }',
  '  n=$((n+1))',
  '  [ "$n" -gt "$max" ] && { echo "gave-up" $pids; exit 0; }',
  '  kill -STOP $pids 2>/dev/null',
  '  kill -KILL $pids 2>/dev/null',
  'done',
].join('\n')

/** The environment entry that tags a process as the conversation's. */
export function conversationProcessTag(conversationId: string): Record<string, string> {
  if (!isTaggableConversationId(conversationId)) {
    throw new Error(`Refusing to tag processes with an unexpected conversation id: ${JSON.stringify(conversationId)}`)
  }
  return { [CONVERSATION_PROCESS_TAG]: conversationId }
}

export function endConversationProcessesArgs(containerName: string, conversationId: string, maxPasses = END_PROCESSES_MAX_PASSES): string[] {
  conversationProcessTag(conversationId)
  return ['exec', '-u', AGENT_IMAGE_USER, containerName, 'sh', '-c', END_PROCESSES_SCRIPT, 'agenthix-end-processes', conversationId, String(maxPasses)]
}

export type EndConversationProcessesResult =
  /** None of the conversation's processes is left. `passes` is how many passes found some (0: there were none). */
  | { kind: 'cleared'; passes: number }
  /** The pass limit ran out with these still found. */
  | { kind: 'gave-up'; remaining: number[] }
  /** The search could not run or did not answer in time; nothing is known about what is left. */
  | { kind: 'failed'; error: string }

export function parseEndProcessesOutput(stdout: string): EndConversationProcessesResult {
  const line = stdout.trim().split('\n').pop() ?? ''
  const cleared = /^cleared (\d+)$/.exec(line)
  if (cleared) return { kind: 'cleared', passes: Number(cleared[1]) }
  if (line.startsWith('gave-up')) {
    return { kind: 'gave-up', remaining: line.split(/\s+/).slice(1).map(Number).filter(Number.isInteger) }
  }
  return { kind: 'failed', error: `unexpected answer: ${JSON.stringify(line.slice(0, 200))}` }
}

/**
 * Ends every process in `containerName` that carries the conversation's tag.
 * Never throws; on a deadline the exec is abandoned, not cancelled
 * (containerLifecycle.ts), and the result says `failed`.
 */
export async function endConversationProcesses(
  containerName: string,
  conversationId: string,
  options: { timeoutMs?: number; maxPasses?: number } = {},
): Promise<EndConversationProcessesResult> {
  let args: string[]
  try {
    args = endConversationProcessesArgs(containerName, conversationId, options.maxPasses)
  } catch (err) {
    return { kind: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
  return dockerWithin(args, options.timeoutMs ?? END_PROCESSES_TIMEOUT_MS).then(
    ({ stdout }) => parseEndProcessesOutput(stdout),
    (err: unknown) => ({ kind: 'failed' as const, error: err instanceof Error ? err.message : String(err) }),
  )
}
