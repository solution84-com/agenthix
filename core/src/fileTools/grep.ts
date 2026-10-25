/**
 * Grep over one root folder, by ripgrep, with Claude Code's Grep parameters and results. The pattern is a model's and
 * is treated as hostile (spec, "Running a pattern safely"): ripgrep runs as its own process with no shell, from
 * arguments built only from Grep's parameters, with no config file, links not followed, hidden files left out, one
 * thread, file-size and line-length caps, and is killed after 2 seconds. Every failure comes back as a result with a
 * fixed message; the optional logger hears the call, its time and outcome, never the pattern.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildRgArgs, checkGrepParams, GREP_LIMITS, type CheckedGrepParams, type GrepOutputMode, type GrepParams } from './grepArgs.js'
import { classifyRgError, defaultGrepRateLimiter, grepRefusalMessage, type GrepRateLimiter, type GrepRefusal } from './grepGuards.js'
import { pageOf, paginate, parseJsonContent, parseNullCounts, parseNullFiles, type GrepFound } from './grepOutput.js'
import { resolveInsideRoot } from './paths.js'
import { refusalMessage, type FileToolRefusal } from './refusals.js'

export type GrepRefused = { ok: false; reason: GrepRefusal | FileToolRefusal; message: string }
export type GrepResult = GrepFound | GrepRefused

export type GrepLogEntry = {
  tool: 'grep'
  mode?: GrepOutputMode
  outcome: 'found' | 'refused'
  reason?: GrepRefusal | FileToolRefusal
  ms: number
  /** Only for a failure ripgrep itself reported: its exit, and never any text of the pattern. */
  detail?: string
}

export type GrepOptions = {
  /** The ripgrep program; `rg` on `PATH` by default. */
  rgPath?: string
  /** Whose calls count together for the limit of 30 a minute: a run or a conversation. The root when not given. */
  callerKey?: string
  limiter?: GrepRateLimiter
  logger?: (entry: GrepLogEntry) => void
}

type RgRun = { kind: 'done'; code: number | null; stdout: string; stderr: string; cut: boolean } | { kind: 'timeout' } | { kind: 'spawn-failed'; code?: string }

function runRg(rgPath: string, args: string[], cwd: string): Promise<RgRun> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(rgPath, args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '' },
        windowsHide: true,
      })
    } catch (err) {
      resolve({ kind: 'spawn-failed', code: (err as NodeJS.ErrnoException).code })
      return
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let cut = false
    let timedOut = false
    let settled = false
    const finish = (r: RgRun) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, GREP_LIMITS.timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (cut) return
      const room = GREP_LIMITS.maxOutputBytes - outBytes
      if (chunk.length >= room) {
        out.push(chunk.subarray(0, room))
        outBytes += room
        cut = true
        child.kill('SIGKILL')
        return
      }
      out.push(chunk)
      outBytes += chunk.length
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (errBytes > 64 * 1024) return
      err.push(chunk)
      errBytes += chunk.length
    })
    child.on('error', e => finish({ kind: 'spawn-failed', code: (e as NodeJS.ErrnoException).code }))
    child.on('close', code => {
      if (timedOut) finish({ kind: 'timeout' })
      else finish({ kind: 'done', code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), cut })
    })
  })
}

async function newestFirst(root: string, files: string[]): Promise<string[]> {
  const stats = await Promise.allSettled(files.map(f => fs.lstat(path.join(root, f))))
  return files
    .map((f, i) => {
      const s = stats[i]
      return { f, mtime: s.status === 'fulfilled' ? s.value.mtimeMs : 0 }
    })
    .sort((a, b) => b.mtime - a.mtime || a.f.localeCompare(b.f))
    .map(e => e.f)
}

async function toResult(root: string, p: CheckedGrepParams, stdout: string, cut: boolean): Promise<GrepFound> {
  if (p.output_mode === 'content') {
    const contextBreaks = [p['-A'], p['-B'], p['-C']].some(n => typeof n === 'number' && n > 0)
    const all = parseJsonContent(stdout, contextBreaks, !cut)
    const { items, appliedLimit } = paginate(all, p.head_limit, p.offset)
    return { ok: true, mode: 'content', lines: items, showLineNumbers: p['-n'], numLines: items.length, totalLines: all.length, ...pageOf(appliedLimit, p.offset, cut) }
  }
  if (p.output_mode === 'count') {
    const all = parseNullCounts(stdout)
    const { items, appliedLimit } = paginate(all, p.head_limit, p.offset)
    const numMatches = all.reduce((sum, c) => sum + c.count, 0)
    return { ok: true, mode: 'count', counts: items, numFiles: all.length, numMatches, ...pageOf(appliedLimit, p.offset, cut) }
  }
  const all = await newestFirst(root, parseNullFiles(stdout))
  const { items, appliedLimit } = paginate(all, p.head_limit, p.offset)
  return { ok: true, mode: 'files_with_matches', filenames: items, numFiles: items.length, totalFiles: all.length, ...pageOf(appliedLimit, p.offset, cut) }
}

/** Searches `root` (a folder the caller trusts) for `params.pattern`. Never throws. */
export async function grep(root: string, params: GrepParams, options: GrepOptions = {}): Promise<GrepResult> {
  const started = Date.now()
  let mode: GrepOutputMode | undefined
  const log = (entry: Omit<GrepLogEntry, 'tool' | 'ms' | 'mode'>) => {
    try {
      options.logger?.({ tool: 'grep', mode, ms: Date.now() - started, ...entry })
    } catch {
      // A logger failing must not fail the search.
    }
  }
  const refuse = (reason: GrepRefusal | FileToolRefusal, message: string, detail?: string): GrepRefused => {
    log({ outcome: 'refused', reason, ...(detail ? { detail } : {}) })
    return { ok: false, reason, message }
  }
  try {
    const limiter = options.limiter ?? defaultGrepRateLimiter
    if (!limiter.take(options.callerKey ?? root)) return refuse('rate-limited', grepRefusalMessage('rate-limited'))

    const checked = checkGrepParams(params)
    if (!checked.ok) {
      return checked.problem === 'pattern-too-long'
        ? refuse('pattern-too-long', grepRefusalMessage('pattern-too-long'))
        : refuse('invalid-parameter', grepRefusalMessage('invalid-parameter', checked.parameter))
    }
    const p = checked.params
    mode = p.output_mode

    let target = '.'
    if (p.path !== undefined) {
      const resolved = resolveInsideRoot(root, p.path)
      if (!resolved.ok) return refuse(resolved.reason, refusalMessage(resolved.reason), resolved.detail)
      const found = await fs.stat(resolved.path).catch(() => null)
      if (!found) return refuse('not-found', refusalMessage('not-found'))
      target = path.relative(await fs.realpath(root), resolved.path) || '.'
    }

    const run = await runRg(options.rgPath ?? 'rg', buildRgArgs(p, target), root)
    if (run.kind === 'timeout') return refuse('too-slow', grepRefusalMessage('too-slow'))
    if (run.kind === 'spawn-failed') return refuse('search-failed', grepRefusalMessage('search-failed'), `ripgrep did not start: ${run.code ?? 'unknown'}`)
    if (run.code === 2 && !run.cut) {
      const problem = classifyRgError(run.stderr)
      if (problem) return refuse(problem, grepRefusalMessage(problem))
      // An unreadable file stops nothing else: what ripgrep found still stands.
      if (run.stdout === '') return refuse('search-failed', grepRefusalMessage('search-failed'), 'ripgrep exit 2')
    } else if (run.code !== 0 && run.code !== 1 && !run.cut) {
      return refuse('search-failed', grepRefusalMessage('search-failed'), `ripgrep exit ${run.code ?? 'signal'}`)
    }
    const result = await toResult(root, p, run.stdout, run.cut)
    log({ outcome: 'found' })
    return result
  } catch {
    return refuse('search-failed', grepRefusalMessage('search-failed'), 'unexpected failure')
  }
}
