/**
 * The rest of the plain checks (R1 rules 3, 7, 8 and 11): a text parameter read outside a file argument, commands
 * that destroy or force, secrets, variables and hosts new since the approved version, and parameters that can start
 * with `-`.
 */
import { readParameterPattern, type WorkflowCheckFlag, type WorkflowVersionContent } from '@agenthix/core'
import { allCode, argsOf, commandIndex, commandName, commandsOf, type Segment } from './code'
import { flagAt, hostKey, placeWords } from './flag'

/** Commands that run, or split into arguments, what they are given. */
const EXECUTES = new Set(['eval', 'source', '.', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'xargs'])
/** Commands that print a file, so its text goes wherever their output does. */
const PRINTS = new Set(['cat', 'head', 'tail', 'tee', 'less', 'more'])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/**
 * Whether the parameter's file is read safely here: as a file argument (`git commit -F /run/params/message`, or
 * `< /run/params/message`), or as one quoted argument, `--title "$(cat /run/params/title)"` (V5).
 */
function safeUse(segments: Segment[], name: string): boolean {
  const file = `/run/params/${name}`
  const quotedRead = new RegExp(`"\\$\\((?:cat\\s+|<\\s*)${file.replace(/\//g, '\\/')}\\s*\\)"`)
  const runsSomething = segments.some((s) => EXECUTES.has(commandName(s)))
  if (runsSomething) return false
  for (const seg of segments) {
    if (seg.inSubstitution) continue
    const at = commandIndex(seg)
    for (let i = 0; i < seg.words.length; i++) {
      const w = seg.words[i]
      if (!w.raw.includes(file)) continue
      if (w.text === file) {
        if (PRINTS.has(commandName(seg)) || seg.pipedOut) return false
        continue
      }
      if (quotedRead.test(w.raw)) {
        if (i < at || ASSIGNMENT.test(w.raw)) return false
        continue
      }
      return false
    }
  }
  return true
}

/** Rule 3: a text parameter used anywhere but as a file argument. */
export function textParameterUse(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  const texts = content.definition.parameters.filter((p) => p.kind === 'text').map((p) => p.name)
  if (!texts.length) return out
  for (const { at, segments } of commandsOf(allCode(content))) {
    for (const name of texts) {
      if (!new RegExp(`/run/params/${name}(?![A-Za-z0-9_])`).test(at.text)) continue
      if (safeUse(segments, name)) continue
      out.push(flagAt(3, `The text parameter ${name} is used at ${placeWords(at)} other than as a file argument, so its value could become part of a command. Pass /run/params/${name} as a file (git commit -F), or as one quoted argument, "$(cat /run/params/${name})".`, at))
    }
  }
  return out
}

const DROP = /\bdrop\s+(table|database|schema|index|view|user|role|owned)\b/i

function destructive(seg: Segment): string | null {
  const name = commandName(seg)
  const args = argsOf(seg).map((w) => w.text)
  if (name === 'rm') {
    const short = args.filter((a) => /^-[A-Za-z]+$/.test(a)).join('')
    const recursive = /[rR]/.test(short) || args.includes('--recursive')
    const force = short.includes('f') || args.includes('--force')
    if (recursive && force) return 'rm -rf'
  }
  if (name === 'git' && args.includes('push') && (args.includes('-f') || args.some((a) => /^\+[^\s]/.test(a)))) return 'git push -f'
  if (args.some((a) => a === '--force' || a.startsWith('--force-') || a.startsWith('--force='))) return '--force'
  return null
}

/** Rule 7: `rm -rf`, `DROP`, `--force`, `git push -f`. */
export function destructiveCommands(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  for (const { at, segments } of commandsOf(allCode(content))) {
    const found = new Set<string>()
    for (const seg of segments) {
      const d = destructive(seg)
      if (d) found.add(d)
    }
    if (!/^\s*(#|--|\/\/)/.test(at.text) && DROP.test(at.text)) found.add('DROP')
    for (const d of found) out.push(flagAt(7, `${d} at ${placeWords(at)} can destroy or overwrite what it reaches.`, at))
  }
  return out
}

/** Rule 8: a secret, variable or host new since the approved version. Nothing is new when none is approved yet. */
export function newSinceApproved(content: WorkflowVersionContent, approved: WorkflowVersionContent | null): WorkflowCheckFlag[] {
  if (!approved) return []
  const out: WorkflowCheckFlag[] = []
  const secrets = (c: WorkflowVersionContent) => new Set(c.definition.steps.flatMap((s) => s.secrets))
  const before = secrets(approved)
  for (const s of [...secrets(content)].sort()) if (!before.has(s)) out.push(flagAt(8, `New secret since the approved version: ${s}.`, { path: 'steps' }))
  const vars = new Set(approved.definition.variables)
  for (const v of content.definition.variables) if (!vars.has(v)) out.push(flagAt(8, `New variable since the approved version: ${v}.`, { path: 'variables' }))
  const hosts = new Set(approved.definition.hosts.map(hostKey))
  for (const h of content.definition.hosts.map(hostKey)) if (!hosts.has(h)) out.push(flagAt(8, `New host since the approved version: ${h}.`, { path: 'hosts' }))
  return out
}

/** Rule 11: a parameter whose pattern or list can give a value starting with `-`, which a command reads as an option. */
export function dashParameters(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  content.definition.parameters.forEach((p, i) => {
    if (p.kind === 'pattern') {
      const r = readParameterPattern(p.pattern)
      if (!r.ok || r.canStartWithDash) {
        out.push(flagAt(11, `${p.name}'s pattern can match a value starting with -, which a command would read as an option.`, { path: `parameters[${i}].pattern` }))
      }
    } else if (p.kind === 'values' && p.values.some((v) => v.startsWith('-'))) {
      out.push(flagAt(11, `One of ${p.name}'s values starts with -, which a command would read as an option.`, { path: `parameters[${i}].values` }))
    }
  })
  return out
}
