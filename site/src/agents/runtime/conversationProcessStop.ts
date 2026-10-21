/**
 * Stopping some of a conversation's own processes when the agent asks (spec,
 * "Keeping the gate whole" item 3, the platform tool `stop_processes`).
 *
 * Every command the agent runs is its own Landlock sandbox, and signals
 * between sandboxes are refused, so a command cannot stop a dev server an
 * earlier command started. The site does it instead, outside the sandbox, with
 * the same search as the finder that ends a conversation's processes
 * (conversationProcesses.ts): the conversation's exact tag, found in every
 * process's environment, frozen, then killed, pass after pass.
 *
 * Two things narrow it further:
 * - **Only commands, never the harness.** A process counts only if it also
 *   carries the command home the launcher gives every command it runs
 *   (`HOME=/home/agent`, agentImage.ts). The `claude` process carries the
 *   conversation's tag but runs with the image user's own home, and OpenCode's
 *   server carries no tag, so neither is ever matched; a command cannot change
 *   the environment of a process outside its sandbox to make it so.
 * - **What the agent names.** With `match`, only processes whose command line
 *   holds that text, literally, are taken — and with each, everything it
 *   started, found by parent while they are all frozen, so a dev server's
 *   workers go with it.
 *
 * It runs as the image's user, like the finder, and never throws.
 */
import { CONVERSATION_PROCESS_TAG } from '@agenthix/core'
import { dockerWithin } from './containerLifecycle'
import { AGENT_IMAGE_USER } from './harnessHomes'
import { COMMAND_HOME } from './agentImage'
import { conversationProcessTag, END_PROCESSES_MAX_PASSES, END_PROCESSES_TIMEOUT_MS } from './conversationProcesses'

/** The longest `match` the tool takes. */
export const STOP_PROCESSES_MATCH_MAX = 200

/**
 * Busybox `sh`, with the id, the text to match (empty for every process) and
 * the pass limit as `$1`–`$3`, never inside the script. `$4` names another
 * process table, for tests only. Each environment is split on NUL with `tr` and
 * matched a whole entry at a time (`-x -F`), so one id is never taken for
 * another it prefixes.
 */
export const STOP_PROCESSES_SCRIPT = [
  'id=$1; match=$2; max=$3; root=${4:-/proc}; self=$$; n=0',
  'commands() {',
  `  for f in $(grep -l -a -F "${CONVERSATION_PROCESS_TAG}=$id" "$root"/[0-9]*/environ 2>/dev/null); do`,
  '    p=${f#"$root"/}; p=${p%/environ}',
  '    [ "$p" = "$self" ] && continue',
  '    [ "$p" = "$PPID" ] && continue',
  '    e=$(tr "\\000" "\\n" < "$f" 2>/dev/null) || continue',
  `    printf '%s\\n' "$e" | grep -q -x -F "${CONVERSATION_PROCESS_TAG}=$id" || continue`,
  `    printf '%s\\n' "$e" | grep -q -x -F "HOME=${COMMAND_HOME}" || continue`,
  '    echo "$p"',
  '  done',
  '}',
  'cmdline() { tr "\\000" " " < "$root/$1/cmdline" 2>/dev/null; }',
  "ppid() { sed -n 's/^PPid:[[:space:]]*//p' \"$root/$1/status\" 2>/dev/null; }",
  'while :; do',
  '  sel=""',
  '  for p in $(commands); do',
  '    if [ -z "$match" ] || cmdline "$p" | grep -q -F -e "$match"; then sel="$sel $p"; fi',
  '  done',
  '  [ -z "$sel" ] && { echo "done $n"; exit 0; }',
  '  n=$((n+1))',
  '  [ "$n" -gt "$max" ] && { echo "gave-up$sel"; exit 0; }',
  '  kill -STOP $sel 2>/dev/null',
  '  while :; do',
  '    new=""',
  '    for p in $(commands); do',
  '      case " $sel " in *" $p "*) continue ;; esac',
  '      pp=$(ppid "$p")',
  '      case " $sel " in *" $pp "*) new="$new $p" ;; esac',
  '    done',
  '    [ -z "$new" ] && break',
  '    kill -STOP $new 2>/dev/null',
  '    sel="$sel$new"',
  '  done',
  '  for p in $sel; do echo "stopped $p $(cmdline "$p" | cut -c1-200)"; done',
  '  kill -KILL $sel 2>/dev/null',
  'done',
].join('\n')

export function stopConversationProcessesArgs(
  containerName: string,
  conversationId: string,
  match: string,
  maxPasses = END_PROCESSES_MAX_PASSES,
): string[] {
  conversationProcessTag(conversationId)
  return ['exec', '-u', AGENT_IMAGE_USER, containerName, 'sh', '-c', STOP_PROCESSES_SCRIPT, 'agenthix-stop-processes', conversationId, match, String(maxPasses)]
}

export type StoppedProcess = { pid: number; command: string }

export type StopConversationProcessesResult =
  /** Nothing matching is left; `stopped` is what was killed, possibly nothing. */
  | { kind: 'stopped'; stopped: StoppedProcess[] }
  /** The pass limit ran out with these still found. */
  | { kind: 'gave-up'; stopped: StoppedProcess[]; remaining: number[] }
  /** The search could not run, or did not answer in time. */
  | { kind: 'failed'; error: string }

export function parseStopProcessesOutput(stdout: string): StopConversationProcessesResult {
  const lines = stdout.split('\n').filter(Boolean)
  const stopped: StoppedProcess[] = []
  for (const line of lines) {
    const m = /^stopped (\d+) ?(.*)$/.exec(line)
    if (m) stopped.push({ pid: Number(m[1]), command: m[2].trim() })
  }
  const last = lines[lines.length - 1] ?? ''
  if (/^done \d+$/.test(last)) return { kind: 'stopped', stopped }
  if (last.startsWith('gave-up')) {
    return { kind: 'gave-up', stopped, remaining: last.split(/\s+/).slice(1).map(Number).filter(Number.isInteger) }
  }
  return { kind: 'failed', error: `unexpected answer: ${JSON.stringify(last.slice(0, 200))}` }
}

/**
 * Stops the processes in `containerName` that the conversation's commands
 * started and whose command line holds `match` (every one when it is empty),
 * with everything they started. Never the harness. Never throws.
 */
export async function stopConversationProcesses(
  containerName: string,
  conversationId: string,
  match: string,
  options: { timeoutMs?: number; maxPasses?: number } = {},
): Promise<StopConversationProcessesResult> {
  if (match.length > STOP_PROCESSES_MATCH_MAX || /[\n\r\0]/.test(match)) {
    return { kind: 'failed', error: 'the text to match must be one line of at most 200 characters' }
  }
  let args: string[]
  try {
    args = stopConversationProcessesArgs(containerName, conversationId, match, options.maxPasses)
  } catch (err) {
    return { kind: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
  return dockerWithin(args, options.timeoutMs ?? END_PROCESSES_TIMEOUT_MS).then(
    ({ stdout }) => parseStopProcessesOutput(stdout),
    (err: unknown) => ({ kind: 'failed' as const, error: err instanceof Error ? err.message : String(err) }),
  )
}
