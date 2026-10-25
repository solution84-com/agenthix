/**
 * The instruction files OpenCode's `read` attaches when a file is read below
 * one (v1.18.32, `session/instruction.ts`, `resolve`): walking up from the
 * file to the session's folder, the first `AGENTS.md` (or `CLAUDE.md`, or the
 * deprecated `CONTEXT.md`) in each folder, once per session.
 *
 * OpenCode reads these by path, so a link planted as `AGENTS.md` would lead
 * its own `read` into the harness home. Here each is opened with the same
 * check as the file itself, and one that is not where it claims to be is
 * skipped.
 */
import path from 'node:path'
import { closeQuietly, openForRead, readAll, type FdPaths } from '@agenthix/core/file-tools'

function instructionNames(env: NodeJS.ProcessEnv): string[] {
  const noClaude = truthy(env.OPENCODE_DISABLE_CLAUDE_CODE) || truthy(env.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT)
  return ['AGENTS.md', ...(noClaude ? [] : ['CLAUDE.md']), 'CONTEXT.md']
}

function truthy(v: string | undefined): boolean {
  return v === 'true' || v === '1'
}

/** The instruction files a read of `filepath` brings along, remembering per session which were given. */
export class InstructionFiles {
  private given = new Map<string, Set<string>>()

  constructor(private sys: FdPaths, private env: NodeJS.ProcessEnv = process.env) {}

  resolve(sessionID: string, root: string, filepath: string): { filepath: string; content: string }[] {
    const results: { filepath: string; content: string }[] = []
    const base = path.resolve(root)
    const target = path.resolve(filepath)
    let set = this.given.get(sessionID)
    if (!set) this.given.set(sessionID, (set = new Set()))
    let current = path.dirname(target)
    while (current.startsWith(base) && current !== base) {
      const found = this.find(current)
      if (found && found.filepath !== target && !set.has(found.filepath)) {
        set.add(found.filepath)
        if (found.content) results.push({ filepath: found.filepath, content: `Instructions from: ${found.filepath}\n${found.content}` })
      }
      current = path.dirname(current)
    }
    return results
  }

  private find(dir: string): { filepath: string; content: string } | null {
    for (const name of instructionNames(this.env)) {
      const filepath = path.join(dir, name)
      let opened
      try {
        opened = openForRead(this.sys, filepath)
      } catch {
        continue
      }
      try {
        if (!opened.stat.isFile()) continue
        return { filepath, content: Buffer.from(readAll(opened.fd)).toString('utf-8') }
      } finally {
        closeQuietly(opened.fd)
      }
    }
    return null
  }
}
