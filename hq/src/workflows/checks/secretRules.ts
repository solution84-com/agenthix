/**
 * The plain checks about where secrets go (R1 rules 1, 5, 9, 10 and 12). A step reads a secret as the file
 * `/run/secrets/<NAME>`; its code is its `run` and every version file that reaches (code.ts). A step's working
 * folder is the workspace's snapshot, so a relative path a script runs is the workspace's file, not the version's.
 */
import type { WorkflowCheckFlag, WorkflowVersionContent } from '@agenthix/core'
import { argsOf, commandIndex, commandName, commandsOf, fileTexts, firstOperand, runPath, stepCode, type CodeLine, type Segment } from './code'
import { flagAt, placeWords, stepWords } from './flag'
import { findInstalls } from './installs'

const SECRET_REF = /\/run\/secrets(?:\/[A-Za-z_][A-Za-z0-9_]*)?(?![A-Za-z0-9_])/
const OUTPUT_COMMANDS = new Set(['echo', 'printf', 'base64', 'curl', 'wget'])
/** Tools in the executor image that read a step's secret themselves. */
const IMAGE_TOOLS_READING: Record<string, string[]> = { 'push-bundle': ['GITHUB_TOKEN'] }

const readsSecret = (text: string, name: string): boolean =>
  new RegExp(`/run/secrets/${name}(?![A-Za-z0-9_])`).test(text) || /\/run\/secrets(?![/A-Za-z0-9_])/.test(text)

/** Rule 1: a secret on the same line as a command that prints, encodes or sends. `cat` counts when it prints. */
export function secretOutput(lines: CodeLine[]): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  for (const { at, segments } of commandsOf(lines)) {
    if (!SECRET_REF.test(at.text)) continue
    const named = segments.map(commandName).find((n) => OUTPUT_COMMANDS.has(n))
      ?? (segments.some((s) => commandName(s) === 'cat' && printsSecret(s)) ? 'cat' : undefined)
    if (named) out.push(flagAt(1, `A secret is used next to ${named} at ${placeWords(at)}: it could print or send the value.`, at))
  }
  return out
}

function printsSecret(seg: Segment): boolean {
  if (seg.pipedOut || seg.inSubstitution) return false
  const args = argsOf(seg)
  if (args.some((w) => w.text.startsWith('>'))) return false
  return args.some((w) => SECRET_REF.test(w.text))
}

/** Rule 5: a step given a secret it never reads, and a step that installs while it holds one. */
export function secretSteps(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  const texts = fileTexts(content)
  content.definition.steps.forEach((step, i) => {
    if (!step.secrets.length) return
    const code = stepCode(content, i, texts)
    const all = code.map((l) => l.text).join('\n')
    const commands = commandsOf(code)
    const tools = new Set(commands.flatMap((c) => c.segments.map(commandName)))
    for (const name of step.secrets) {
      const byTool = [...tools].some((t) => IMAGE_TOOLS_READING[t]?.includes(name))
      if (!byTool && !readsSecret(all, name)) {
        out.push(flagAt(5, `${stepWords(i)} is given ${name} but never reads /run/secrets/${name}: give it only to the steps that use it.`, { path: `steps[${i}].secrets` }))
      }
    }
    for (const install of findInstalls(commands, content.files.map((f) => f.path), texts)) {
      out.push(flagAt(5, `${stepWords(i)} holds a secret and installs software (${install.what}, at ${placeWords(install.at)}): what it installs can read the secret. Install in a step with no secret.`, install.at))
    }
  })
  return out
}

const NPM_SCRIPTS = new Set(['run', 'run-script', 'rum', 'test', 't', 'tst', 'start', 'stop', 'restart', 'exec', 'x', 'rebuild'])
const PNPM_SCRIPTS = new Set(['run', 'exec', 'dlx', 'test', 't', 'start'])
const BUN_SCRIPTS = new Set(['run', 'x', 'test'])
const YARN_NOT_SCRIPTS = new Set(['install', 'add', 'remove', 'upgrade', 'why', 'info', 'config', 'cache', 'init', 'set'])
const ALWAYS_WORKSPACE = new Set(['npx', 'pnpx', 'bunx', 'make', 'just'])
const INTERPRETERS = new Set(['node', 'python', 'python3', 'sh', 'bash', 'zsh', 'dash', 'ruby', 'perl', 'deno', 'tsx', 'ts-node'])
const INLINE_CODE = new Set(['-c', '-e', '--eval', '-p', '--print'])
/** Absolute paths outside the workspace that hold no code the agent wrote. `/run/out` isn't one: earlier steps write it. */
const OUTSIDE = /^\/(run\/workflow|usr|bin|sbin|opt|tmp)\//
const BUILD_OUTPUT = /(^|\/)(node_modules|dist|build)\//

function workspacePath(path: string, files: Set<string>, firstOfRun: boolean): boolean {
  if (path.startsWith('/')) return !OUTSIDE.test(path)
  // A run's own first word naming a version file is that file (spec part 2, *The approved files*).
  if (firstOfRun && files.has(path.replace(/^\.\//, ''))) return false
  return true
}

/** What workspace code a command runs, in words; null when it runs none that can be told. */
function workspaceCode(seg: Segment, files: Set<string>, firstOfRun: boolean): string | null {
  const name = commandName(seg)
  const args = argsOf(seg)
  const verb = firstOperand(args)?.word.text
  const at = commandIndex(seg)
  if (at < 0) return null
  const word = seg.words[at].text
  if (BUILD_OUTPUT.test(word)) return word
  if (word.includes('/') && workspacePath(word, files, firstOfRun)) return word
  if (name === 'npm' && verb && NPM_SCRIPTS.has(verb)) return `npm ${verb}`
  if (name === 'pnpm' && verb && PNPM_SCRIPTS.has(verb)) return `pnpm ${verb}`
  if (name === 'bun' && verb && BUN_SCRIPTS.has(verb)) return `bun ${verb}`
  if (name === 'yarn' && verb && !YARN_NOT_SCRIPTS.has(verb)) return `yarn ${verb}`
  if (ALWAYS_WORKSPACE.has(name)) return name
  if (INTERPRETERS.has(name) && !args.some((w) => INLINE_CODE.has(w.text))) {
    const script = firstOperand(args)?.word.text
    if (script && (script.includes('/') || /\.[a-z]+$/.test(script)) && (BUILD_OUTPUT.test(script) || workspacePath(script, files, firstOfRun))) {
      return `${name} ${script}`
    }
  }
  return null
}

/** Rule 9: a step that holds a secret and runs code from the workspace rather than the approved files. High. */
export function secretRunsWorkspace(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  const files = new Set(content.files.map((f) => f.path))
  const texts = fileTexts(content)
  content.definition.steps.forEach((step, i) => {
    if (!step.secrets.length) return
    for (const { at, segments } of commandsOf(stepCode(content, i, texts))) {
      segments.forEach((seg, k) => {
        const firstOfRun = at.path === runPath(i) && at.line === 1 && k === 0
        const what = workspaceCode(seg, files, firstOfRun)
        if (what) {
          out.push(flagAt(9, `This step runs code the agent can change after approval: ${stepWords(i)} holds a secret and runs ${what} from the workspace (${placeWords(at)}).`, at, true))
        }
      })
    }
  })
  return out
}

const CLEAN_PATH = /^(\/tmp(\/|$)|\$\(mktemp)/

/** Rule 10: a step that holds a secret and runs git in the workspace's repository. High. */
export function secretGitInWorkspace(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  const texts = fileTexts(content)
  content.definition.steps.forEach((step, i) => {
    if (!step.secrets.length) return
    const byPath = new Map<string, CodeLine[]>()
    for (const l of stepCode(content, i, texts)) byPath.set(l.path, [...(byPath.get(l.path) ?? []), l])
    for (const lines of byPath.values()) {
      const cleanVars = new Set<string>()
      let inClean = false
      const clean = (target: string | undefined): boolean => {
        if (!target) return false
        if (CLEAN_PATH.test(target)) return true
        const v = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?(\/.*)?$/.exec(target)
        return v !== null && cleanVars.has(v[1])
      }
      for (const { at, segments } of commandsOf(lines)) {
        for (const seg of segments) {
          for (const w of seg.words) {
            const a = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(w.text)
            if (a && a[1] !== 'GIT_DIR' && (a[2].includes('mktemp') || CLEAN_PATH.test(a[2]))) cleanVars.add(a[1])
          }
          const name = commandName(seg)
          if (name === 'cd') { inClean = clean(firstOperand(argsOf(seg))?.word.text); continue }
          if (name !== 'git' || inClean) continue
          const args = argsOf(seg).map((w) => w.text)
          const dashC = args.indexOf('-C')
          const gitDir = args.find((a) => a.startsWith('--git-dir='))?.slice('--git-dir='.length)
          const envDir = seg.words.map((w) => /^GIT_DIR=(.*)$/.exec(w.text)?.[1]).find((d) => d !== undefined)
          const sub = args.find((a) => !a.startsWith('-') && a !== args[dashC + 1])
          const target = sub === 'clone' || sub === 'init' ? args[args.length - 1] : undefined
          if ((dashC >= 0 && clean(args[dashC + 1])) || clean(gitDir) || clean(envDir) || clean(target)) continue
          out.push(flagAt(10, `${stepWords(i)} holds a secret and runs git in the workspace's repository (${placeWords(at)}), whose hooks and config the agent writes. Run git with the secret in a new repository under /tmp.`, at, true))
        }
      }
    }
  })
  return out
}

const RUN_OUT = /\/run\/out(?![A-Za-z0-9_])/
const RUN_OUT_READERS = new Set(['push-bundle', 'cat', 'head', 'tail', 'wc', 'sha256sum', 'shasum', 'grep', 'test', '['])
const COPIERS = new Set(['cp', 'mv', 'rsync', 'install', 'ln'])

/** Whether a command writes under /run/out; one it can't tell about counts as writing. */
function writesRunOut(seg: Segment): boolean {
  const name = commandName(seg)
  const args = argsOf(seg)
  const git = name === 'git' ? args.find((w) => !w.text.startsWith('-'))?.text : undefined
  return seg.words.some((w, k) => {
    if (!RUN_OUT.test(w.text)) return false
    const before = seg.words[k - 1]?.text ?? ''
    if (before.startsWith('>')) return true
    if (before.startsWith('<')) return false
    if (RUN_OUT_READERS.has(name) || (git && ['fetch', 'pull', 'clone', 'ls-remote'].includes(git))) return false
    if (COPIERS.has(name)) return args.filter((a) => !a.text.startsWith('-')).at(-1) === w
    return true
  })
}

/** Rule 12: a step that holds a secret writes to /run/out, which hands files on to later steps. */
export function secretHandsOn(content: WorkflowVersionContent): WorkflowCheckFlag[] {
  const out: WorkflowCheckFlag[] = []
  const texts = fileTexts(content)
  const steps = content.definition.steps
  const code = steps.map((_, i) => stepCode(content, i, texts))
  const mentions = code.map((lines) => lines.find((l) => RUN_OUT.test(l.text)) ?? null)
  steps.forEach((step, i) => {
    const writes = step.secrets.length ? commandsOf(code[i]).find(({ segments }) => segments.some(writesRunOut))?.at : undefined
    if (!step.secrets.length || !writes) return
    const reader = mentions.findIndex((m, j) => j > i && m !== null)
    const readerAt = reader >= 0 ? mentions[reader]! : null
    const high = readerAt !== null && content.definition.hosts.length > 0
    const later = readerAt ? `, which ${stepWords(reader).toLowerCase()} reads (${placeWords(readerAt)})${high ? ' and the workflow has hosts it can send it to' : ''}` : ''
    out.push(flagAt(12, `A step with a secret writes to /run/out: ${stepWords(i)} (${placeWords(writes)})${later}. Check that nothing it hands on holds the secret.`, writes, high))
  })
  return out
}
