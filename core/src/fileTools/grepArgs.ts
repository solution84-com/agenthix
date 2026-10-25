/**
 * Grep's parameters, checked, and the ripgrep arguments they become. Only these parameters reach the command line;
 * every value goes in as its own argument or after `=`, so nothing a model writes can become a flag (spec S2b).
 */
export type GrepOutputMode = 'content' | 'files_with_matches' | 'count'

export type GrepParams = {
  pattern: string
  path?: string
  glob?: string
  output_mode?: GrepOutputMode
  '-i'?: boolean
  '-n'?: boolean
  '-A'?: number
  '-B'?: number
  '-C'?: number
  head_limit?: number
  offset?: number
  multiline?: boolean
}

export type CheckedGrepParams = Required<Pick<GrepParams, 'pattern' | 'output_mode' | '-i' | '-n' | 'offset' | 'multiline'>> &
  Pick<GrepParams, 'path' | 'glob' | '-A' | '-B' | '-C' | 'head_limit'>

export const GREP_LIMITS = {
  patternChars: 500,
  globChars: 500,
  maxContext: 100,
  timeoutMs: 2000,
  callsPerMinute: 30,
  maxFilesize: '1M',
  maxColumns: 500,
  maxOutputBytes: 4 * 1024 * 1024,
  defaultHeadLimit: 250,
} as const

const MODES: readonly GrepOutputMode[] = ['content', 'files_with_matches', 'count']

export type GrepParamsCheck =
  | { ok: true; params: CheckedGrepParams }
  | { ok: false; problem: 'pattern-too-long' }
  | { ok: false; problem: 'invalid-parameter'; parameter: keyof GrepParams }

function isCount(v: unknown, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
}

function hasNul(s: string): boolean {
  return s.includes('\0')
}

export function checkGrepParams(input: unknown): GrepParamsCheck {
  const bad = (parameter: keyof GrepParams): GrepParamsCheck => ({ ok: false, problem: 'invalid-parameter', parameter })
  if (typeof input !== 'object' || input === null) return bad('pattern')
  const p = input as Record<string, unknown>
  if (typeof p.pattern !== 'string' || hasNul(p.pattern)) return bad('pattern')
  if (Array.from(p.pattern).length > GREP_LIMITS.patternChars) return { ok: false, problem: 'pattern-too-long' }
  if (p.path !== undefined && (typeof p.path !== 'string' || hasNul(p.path))) return bad('path')
  if (p.glob !== undefined && (typeof p.glob !== 'string' || hasNul(p.glob) || p.glob.length > GREP_LIMITS.globChars)) return bad('glob')
  if (p.output_mode !== undefined && !MODES.includes(p.output_mode as GrepOutputMode)) return bad('output_mode')
  for (const flag of ['-i', '-n', 'multiline'] as const) {
    if (p[flag] !== undefined && typeof p[flag] !== 'boolean') return bad(flag)
  }
  for (const n of ['-A', '-B', '-C'] as const) {
    if (p[n] !== undefined && !isCount(p[n], GREP_LIMITS.maxContext)) return bad(n)
  }
  if (p.head_limit !== undefined && !isCount(p.head_limit)) return bad('head_limit')
  if (p.offset !== undefined && !isCount(p.offset)) return bad('offset')
  return {
    ok: true,
    params: {
      pattern: p.pattern,
      path: p.path === '' ? undefined : (p.path as string | undefined),
      glob: p.glob as string | undefined,
      output_mode: (p.output_mode as GrepOutputMode | undefined) ?? 'files_with_matches',
      '-i': (p['-i'] as boolean | undefined) ?? false,
      '-n': (p['-n'] as boolean | undefined) ?? true,
      '-A': p['-A'] as number | undefined,
      '-B': p['-B'] as number | undefined,
      '-C': p['-C'] as number | undefined,
      head_limit: p.head_limit as number | undefined,
      offset: (p.offset as number | undefined) ?? 0,
      multiline: (p.multiline as boolean | undefined) ?? false,
    },
  }
}

/** Grep's `glob`: split on whitespace, then on commas unless the part holds a `{…}` alternation. */
export function splitGlobs(glob: string): string[] {
  const out: string[] = []
  for (const part of glob.split(/\s+/)) {
    if (part.includes('{') && part.includes('}')) out.push(part)
    else out.push(...part.split(','))
  }
  return out.filter(Boolean)
}

/** `target` is the path to search, relative to the root ripgrep runs in. */
export function buildRgArgs(p: CheckedGrepParams, target: string): string[] {
  const args = [
    '--no-config',
    '--no-follow',
    '--threads=1',
    `--max-filesize=${GREP_LIMITS.maxFilesize}`,
    `--max-columns=${GREP_LIMITS.maxColumns}`,
    '--color=never',
  ]
  if (p.multiline) args.push('--multiline', '--multiline-dotall')
  if (p['-i']) args.push('--ignore-case')
  if (p.output_mode === 'files_with_matches') args.push('--files-with-matches', '--null')
  else if (p.output_mode === 'count') args.push('--count', '--with-filename', '--null', '--sort=path')
  else {
    args.push('--json', '--line-number', '--sort=path')
    if (p['-C'] !== undefined) args.push(`--context=${p['-C']}`)
    else {
      if (p['-B'] !== undefined) args.push(`--before-context=${p['-B']}`)
      if (p['-A'] !== undefined) args.push(`--after-context=${p['-A']}`)
    }
  }
  if (p.glob !== undefined) for (const g of splitGlobs(p.glob)) args.push(`--glob=${g}`)
  args.push('-e', p.pattern, '--', target)
  return args
}
