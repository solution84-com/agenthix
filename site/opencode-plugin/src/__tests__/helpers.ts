/**
 * Test stand-ins: descriptor naming on a machine without `/proc` (the kernel's
 * answer is modelled as the real path at the moment of opening, which is what
 * `/proc/self/fd` reports on Linux), a tool context, and a site.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { HarnessGateRequest, HarnessGateResponse, HarnessTurn } from '@agenthix/core'
import type { FdPaths } from '@agenthix/core/file-tools'
import type { SiteClient } from '../site'

export function tempDir(): string {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ahx-plugin-'))
}

/** `beforeOpen` runs just before each open, as a command racing the tool would. */
export function testFdPaths(beforeOpen?: (p: string) => void): FdPaths {
  const where = new Map<number, string>()
  const real = (p: string) => {
    const parent = fs.realpathSync(path.dirname(p))
    return path.join(parent, path.basename(p))
  }
  return {
    open(p, flags, mode) {
      beforeOpen?.(p)
      const fd = fs.openSync(p, flags, mode)
      where.set(fd, fs.fstatSync(fd).isDirectory() ? fs.realpathSync(p) : real(p))
      return fd
    },
    pathOf(fd) {
      const p = where.get(fd)
      if (!p) throw new Error('unknown descriptor')
      return p
    },
    child(fd, name) {
      return path.join(this.pathOf(fd), name)
    },
  }
}

export type Asked = { permission: string; patterns: string[] }

export function toolContext(directory: string, sessionID = 'ses_A'): ToolContext & { asked: Asked[] } {
  const asked: Asked[] = []
  return {
    sessionID,
    messageID: 'msg_1',
    agent: 'build',
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async input => { asked.push({ permission: input.permission, patterns: input.patterns }) },
    asked,
  }
}

export function fakeSite(opts: {
  turns?: Record<string, HarnessTurn | null>
  decide?: (token: string, request: HarnessGateRequest) => HarnessGateResponse
}): SiteClient & { decided: { token: string; request: HarnessGateRequest }[] } {
  const decided: { token: string; request: HarnessGateRequest }[] = []
  return {
    decided,
    async turn(sessionId) {
      return opts.turns?.[sessionId] ?? null
    },
    async decide(token, request) {
      decided.push({ token, request })
      return opts.decide ? opts.decide(token, request) : { decision: 'allow' }
    },
  }
}

export function turnFor(conversationId: string, key = `key-${conversationId}`): HarnessTurn {
  return { conversationId, conversationToken: `tok-${conversationId}`, modelHeaders: { Authorization: `Bearer ${key}` } }
}
