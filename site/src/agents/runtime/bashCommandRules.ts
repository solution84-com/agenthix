/**
 * An agent's command rules (`allowedBashPatterns`) applied to a whole bash
 * command line, as the shell would run it (shellCommands.ts).
 *
 * A rule is a command's first words: `npm run` matches `npm run build` and
 * not `npm runx`; a word ending in `*` matches any word it starts, and a rule
 * of `*` matches every command. Each simple command in the line is judged:
 *
 * - `never` binds when any rule in that state matches the command, whatever
 *   the order of the rules — also matched past leading assignments, a path
 *   to the program, a wrapper such as `env`, `nohup` or `sudo`, and the
 *   script of `sh -c` or `eval`.
 * - `ask` binds the same way over a rule in state `always`.
 * - Otherwise the first rule that matches the command as written decides,
 *   and a command no rule matches follows "Any other command": bash's own state.
 *
 * The line takes the strictest of its commands' states. A command whose name
 * is worked out when it runs (`$CMD`, `$(…)`, a file pattern) matches no
 * rule but `*`, and is asked about where a `never` rule exists. A line that
 * cannot be read is asked about unless every rule, and bash itself, is `always`.
 */
import type { BashPatternPermission, ToolPermissionState } from './types'
import { shellWords, splitShellCommand } from './shellCommands'
import type { SimpleCommand } from './shellCommands'

const SEVERITY: Record<ToolPermissionState, number> = { always: 0, ask: 1, never: 2 }
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
/** Programs that run the command given after their own options. */
const WRAPPERS = new Set(['env', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'doas', 'nice', 'ionice', 'setsid', 'stdbuf', 'timeout', 'xargs', 'time'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/

function wordsMatch(rule: string[], words: string[]): boolean {
  for (let i = 0; i < rule.length; i++) {
    const r = rule[i]!
    if (r === '*' && i === rule.length - 1) return true
    const w = words[i]
    if (w === undefined) return false
    if (r.endsWith('*') ? !w.startsWith(r.slice(0, -1)) : w !== r) return false
  }
  return true
}

function ruleMatches(pattern: string, words: string[]): boolean {
  if (pattern.trim() === '*') return true
  const rule = shellWords(pattern)
  return !!rule?.length && wordsMatch(rule, words)
}

const basename = (word: string) => word.slice(word.lastIndexOf('/') + 1)

/**
 * The forms a command can be matched in for `never` and `ask`: as written, and
 * past its assignments, its program's path, its wrappers (from each word
 * after the wrapper, since an option may take a value) and a shell's script.
 * `unreadable`: a script inside it could not be read.
 */
function forms(command: SimpleCommand): { all: string[][]; unreadable: boolean } {
  const found = { all: [command.words], unreadable: false }
  gather(command.words.slice(command.assignments), 0, found)
  return found
}

const MAX_NESTING = 4
/** How far into a wrapper's words the command it runs is looked for. */
const WRAPPER_REACH = 6

function gather(rest: string[], depth: number, found: { all: string[][]; unreadable: boolean }): void {
  if (!rest.length || depth > MAX_NESTING) return
  const name = basename(rest[0]!)
  const args = rest.slice(1)
  found.all.push(rest, [name, ...args])
  if (SHELLS.has(name) || name === 'eval') {
    const at = name === 'eval' ? -1 : args.findIndex(a => /^-[a-z]*c[a-z]*$/.test(a))
    const script = name === 'eval' ? args.join(' ') : at >= 0 ? args[at + 1] : undefined
    if (script === undefined) return
    const inner = splitShellCommand(script)
    if (!inner) found.unreadable = true
    for (const c of inner ?? []) {
      found.all.push(c.words)
      if (c.dynamic) found.unreadable = true
      gather(c.words.slice(c.assignments), depth + 1, found)
    }
    return
  }
  if (!WRAPPERS.has(name)) return
  for (let i = 0; i < Math.min(args.length, WRAPPER_REACH); i++) {
    if (!args[i]!.startsWith('-') && !ASSIGNMENT.test(args[i]!)) gather(args.slice(i), depth + 1, found)
  }
}

function commandState(command: SimpleCommand, patterns: BashPatternPermission[], anyOther: ToolPermissionState): ToolPermissionState {
  const specific = patterns.filter(p => p.pattern.trim() !== '*')
  const { all, unreadable } = forms(command)
  const binds = (state: ToolPermissionState) =>
    specific.some(p => p.state === state && all.some(words => ruleMatches(p.pattern, words)))
  if (binds('never')) return 'never'
  const guarded = specific.some(p => p.state === 'never')

  let state: ToolPermissionState
  if (command.dynamic) {
    state = patterns.find(p => p.pattern.trim() === '*')?.state ?? anyOther
  } else {
    state = patterns.find(p => ruleMatches(p.pattern, command.words))?.state ?? anyOther
  }
  if (state === 'always' && (binds('ask') || ((command.dynamic || unreadable) && guarded))) return 'ask'
  return state
}

/** The state a whole bash command line is in: the strictest of its simple commands'. */
export function getBashPatternState(
  cmd: string,
  patterns: BashPatternPermission[],
  anyOtherCommand: ToolPermissionState,
): ToolPermissionState {
  const commands = splitShellCommand(cmd)
  if (!commands) {
    if (anyOtherCommand === 'never') return 'never'
    return anyOtherCommand === 'always' && patterns.every(p => p.state === 'always') ? 'always' : 'ask'
  }
  if (!commands.length) return anyOtherCommand
  return commands
    .map(c => commandState(c, patterns, anyOtherCommand))
    .reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a))
}

/** Whether a person approved exactly this command for the run: a request grants only the command it showed. */
export function commandApproved(cmd: string, approvedCommands: readonly string[]): boolean {
  return approvedCommands.some(approved => approved.trim() === cmd)
}
