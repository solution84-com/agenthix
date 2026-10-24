#!/usr/bin/env node
// Each image part's content key: a SHA-256 over what the part is built from, so the same key is the same image.
//   node scripts/images/keys.mjs [<commit>] [--worktree] [--json]
//   node scripts/images/keys.mjs [<commit>] [--worktree] --tools-key   the shared tools stage's key (the agent and executor images' label)
// The commit defaults to HEAD; --worktree keys the working tree as it is now (uncommitted changes included, files
// Git ignores left out), for a local build. It reads Git only: no Docker, nothing built.
//
// The key covers the Dockerfile's path and target, the Git object ID of .dockerignore, of the Dockerfile and of each
// input path (which changes exactly when a file under it changes), the Dockerfile's FROM references, and the rebuild
// epoch. The parts and their inputs are read from parts.json at the same commit.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARTS_FILE, parsePartsFile } from './parts.mjs'

const git = (cwd, args, env) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26 }).trim()

/** A tree object for the working tree, made in a throwaway index so the real one is not touched. */
function worktreeTree(cwd) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-index-'))
  try {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') }
    git(cwd, ['add', '-A', '--', '.'], env)
    return git(cwd, ['write-tree'], env)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** The images a Dockerfile builds on: its FROM references, leaving out its own stages. */
export function fromReferences(dockerfile) {
  const stages = new Set()
  const refs = []
  for (const line of dockerfile.split('\n')) {
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line)
    if (!m) continue
    if (!stages.has(m[1].toLowerCase())) refs.push(m[1])
    if (m[2]) stages.add(m[2].toLowerCase())
  }
  return refs
}

/** The keys of every part: { part: key }. `ref` is a commit, or `{ worktree: true }`. */
export function computeKeys({ cwd, ref = 'HEAD', worktree = false }) {
  const treeish = worktree ? worktreeTree(cwd) : ref
  const id = p => git(cwd, ['rev-parse', `${treeish}:${p.replace(/\/$/, '')}`])
  const { rebuildEpoch, parts } = parsePartsFile(git(cwd, ['show', `${treeish}:${PARTS_FILE}`]))
  const dockerignore = id('.dockerignore')
  const keys = {}
  for (const [part, p] of Object.entries(parts)) {
    const dockerfile = git(cwd, ['show', `${treeish}:${p.dockerfile}`])
    const material = [
      `dockerfile ${p.dockerfile}`,
      `target ${p.target ?? ''}`,
      `dockerignore ${dockerignore}`,
      `dockerfile-object ${id(p.dockerfile)}`,
      ...p.inputs.map(input => `input ${input} ${id(input)}`),
      ...fromReferences(dockerfile).map(from => `from ${from}`),
      `epoch ${rebuildEpoch}`,
    ]
    keys[part] = crypto.createHash('sha256').update(material.join('\n')).digest('hex')
  }
  return keys
}

/** The tools stage of a Dockerfile: the lines between its markers, markers included, or null. */
export function toolsStageOf(dockerfile) {
  const m = /^# >>> tools stage[^\n]*\n[\s\S]*?^# <<< tools stage$/m.exec(dockerfile)
  return m ? m[0] : null
}

export const TOOLS_STAGE_DOCKERFILE = 'site/docker/executor.Dockerfile'

/**
 * The content key of the shared tools stage the agent and executor images are both built on (a test holds the two
 * copies identical): a SHA-256 over the stage's text, which carries its base image and what it installs, and the Git
 * object ID of every file the stage copies in. It moves exactly when the tools do, and not when anything else in
 * either image does, so an approved workflow survives an image that changed only elsewhere. The images carry it as
 * the label `tools-stage-key`, which the site reports to hq.
 */
export function computeToolsKey({ cwd, ref = 'HEAD', worktree = false }) {
  const treeish = worktree ? worktreeTree(cwd) : ref
  const stage = toolsStageOf(git(cwd, ['show', `${treeish}:${TOOLS_STAGE_DOCKERFILE}`]))
  if (!stage) throw new Error(`${TOOLS_STAGE_DOCKERFILE} has no tools stage between its markers`)
  const copied = []
  for (const line of stage.split('\n')) {
    const m = /^\s*COPY\s+(?:--\S+\s+)*(.+)$/i.exec(line)
    if (!m) continue
    const words = m[1].trim().split(/\s+/)
    for (const src of words.slice(0, -1)) copied.push(`copy ${src} ${git(cwd, ['rev-parse', `${treeish}:${src.replace(/\/$/, '')}`])}`)
  }
  return crypto.createHash('sha256').update(['tools-stage', stage, ...copied].join('\n')).digest('hex')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  if (args.includes('--tools-key')) {
    console.log(computeToolsKey({ cwd, ref: args.find(a => !a.startsWith('--')), worktree: args.includes('--worktree') }))
    process.exit(0)
  }
  const keys = computeKeys({ cwd, ref: args.find(a => !a.startsWith('--')), worktree: args.includes('--worktree') })
  if (args.includes('--json')) console.log(JSON.stringify(keys))
  else for (const [part, key] of Object.entries(keys)) console.log(`${part} ${key}`)
}
