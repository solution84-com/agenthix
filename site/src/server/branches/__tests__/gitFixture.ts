/**
 * Real repositories for the commit helper's tests: an owner's folder in a temporary directory with `workspaces/` and
 * `clones/` side by side, as on a site's disk, and the program run as a local process (`contained: false`).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { helperDeps, runHelper, type HelperAnswer } from '../helperContainer'

export const AUTHOR = { name: 'Ada Lovelace', email: 'ada@example.com' }
export const AGENT = { name: 'Kernel', email: 'kernel@agents.example' }
export const local = { ...helperDeps, contained: () => false }

export type Owner = { root: string; ws: string; copyDir: (id: string) => string }

export function makeOwner(): Owner {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-owner-'))
  const ws = path.join(root, 'workspaces', 'w1')
  fs.mkdirSync(ws, { recursive: true })
  fs.mkdirSync(path.join(root, 'clones'))
  return { root, ws, copyDir: id => path.join(root, 'clones', id) }
}

/** `git` run as a person would, outside the helper, for setting up and checking a test. */
export function sh(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd, input, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
  }).toString().trim()
}

export function write(dir: string, rel: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), body)
}

export const at = () => new Date().toISOString()

/** One operation through the helper, as the site's methods call it. */
export function op(owner: Owner, request: Record<string, unknown>, copy?: { id: string; readOnly: boolean }, wsReadOnly = false): Promise<HelperAnswer> {
  if (copy) fs.mkdirSync(owner.copyDir(copy.id), { recursive: true })
  return runHelper({
    workspaceId: 'w1',
    ws: { dir: owner.ws, readOnly: wsReadOnly },
    ...(copy ? { copy: { dir: owner.copyDir(copy.id), readOnly: copy.readOnly } } : {}),
    network: false,
    timeoutMs: 60_000,
  }, request, local)
}

/** A workspace with Git on and one version, through the helper's own `init`. */
export async function gitOn(owner: Owner, files: Record<string, string> = { 'README.md': 'hello\n' }): Promise<HelperAnswer> {
  for (const [rel, body] of Object.entries(files)) write(owner.ws, rel, body)
  return op(owner, { op: 'init', author: AUTHOR, at: at(), message: 'First version', large: 50 * 1024 * 1024, ignored: ['node_modules'] })
}

export const COPY_A = '11111111-1111-4111-8111-111111111111'
export const COPY_B = '22222222-2222-4222-8222-222222222222'
