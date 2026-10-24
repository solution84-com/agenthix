import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { takeSnapshot } from '../snapshot'
import { buildManifest } from '../manifest'
import { diffManifests } from '../changeSet'
import { writeBack } from '../writeBack'
import { LinkRefused } from '../safeTree'
import { tempDir, writeTree } from './fixtures'

let base: string
let ws: string
let snap: string
let outside: string

beforeEach(async () => {
  base = await tempDir('executor-tree-')
  ws = path.join(base, 'workspace')
  snap = path.join(base, 'snapshot')
  outside = path.join(base, 'outside')
  await writeTree(ws, { 'README.md': 'hello', 'src/app.js': 'console.log(1)', 'bin/run.sh': '#!/bin/sh\n' })
  await fs.chmod(path.join(ws, 'bin/run.sh'), 0o755)
  await writeTree(outside, { 'secret.txt': 'outside the workspace' })
})

afterEach(async () => {
  await fs.chmod(snap, 0o755).catch(() => {})
  await fs.rm(base, { recursive: true, force: true })
})

async function run(change: (snapshot: string) => Promise<void>, agent: () => Promise<void> = async () => {}) {
  const s = await takeSnapshot(ws, snap)
  await change(snap)
  await agent()
  const end = await buildManifest(snap)
  const changes = diffManifests(s.manifest, end)
  return writeBack({ runId: 'run-1', workspaceDir: ws, snapshotDir: snap, start: s.manifest, end, changes })
}

describe('the snapshot', () => {
  it('copies the workspace, modes kept, and records it by content', async () => {
    const s = await takeSnapshot(ws, snap)
    expect(await fs.readFile(path.join(snap, 'src/app.js'), 'utf8')).toBe('console.log(1)')
    expect((await fs.stat(path.join(snap, 'bin/run.sh'))).mode & 0o777).toBe(0o755)
    expect(s.manifest.get('README.md')).toMatchObject({ kind: 'file', mode: expect.any(Number) })
    expect(['CLONE', 'COPY']).toContain(s.kind)
  })

  it('is not changed by the agent writing the workspace after it was taken', async () => {
    await takeSnapshot(ws, snap)
    await fs.writeFile(path.join(ws, 'README.md'), 'changed by the agent')
    expect(await fs.readFile(path.join(snap, 'README.md'), 'utf8')).toBe('hello')
  })

  it('copies a symbolic link as a link and never follows it (V6, attack A13)', async () => {
    await fs.symlink(path.join(outside, 'secret.txt'), path.join(ws, 'link.txt'))
    await fs.symlink(outside, path.join(ws, 'linked-dir'))
    const s = await takeSnapshot(ws, snap)
    expect((await fs.lstat(path.join(snap, 'link.txt'))).isSymbolicLink()).toBe(true)
    expect((await fs.lstat(path.join(snap, 'linked-dir'))).isSymbolicLink()).toBe(true)
    expect(s.manifest.get('link.txt')).toEqual({ kind: 'link', target: path.join(outside, 'secret.txt') })
    expect(s.manifest.has('linked-dir/secret.txt')).toBe(false)
  })

  it('refuses a hard link, whose other name may be outside the workspace', async () => {
    await fs.link(path.join(outside, 'secret.txt'), path.join(ws, 'hard.txt'))
    await expect(takeSnapshot(ws, snap)).rejects.toBeInstanceOf(LinkRefused)
  })

  it('refuses a workspace that is itself a link', async () => {
    const linked = path.join(base, 'ws-link')
    await fs.symlink(ws, linked)
    await expect(takeSnapshot(linked, snap)).rejects.toBeInstanceOf(LinkRefused)
  })
})

describe('writing back', () => {
  it('applies the run\'s changes: created, changed and deleted', async () => {
    const result = await run(async s => {
      await fs.writeFile(path.join(s, 'src/app.js'), 'console.log(2)')
      await fs.mkdir(path.join(s, 'dist'))
      await fs.writeFile(path.join(s, 'dist/out.js'), 'built')
      await fs.rm(path.join(s, 'README.md'))
    })
    expect(await fs.readFile(path.join(ws, 'src/app.js'), 'utf8')).toBe('console.log(2)')
    expect(await fs.readFile(path.join(ws, 'dist/out.js'), 'utf8')).toBe('built')
    await expect(fs.stat(path.join(ws, 'README.md'))).rejects.toThrow()
    expect(result.changed.sort()).toEqual(['README.md', 'dist', 'dist/out.js', 'src/app.js'])
    expect(result.conflicts).toEqual([])
  })

  it('keeps a file the agent changed meanwhile, with the run\'s copy beside it', async () => {
    const result = await run(
      async s => { await fs.writeFile(path.join(s, 'src/app.js'), 'from the run') },
      async () => { await fs.writeFile(path.join(ws, 'src/app.js'), 'from the agent') },
    )
    expect(await fs.readFile(path.join(ws, 'src/app.js'), 'utf8')).toBe('from the agent')
    expect(await fs.readFile(path.join(ws, 'src/app.js.workflow-run-1'), 'utf8')).toBe('from the run')
    expect(result.conflicts).toEqual([{ path: 'src/app.js', keptAs: 'src/app.js.workflow-run-1' }])
  })

  it('does not delete a file the agent changed meanwhile', async () => {
    await run(
      async s => { await fs.rm(path.join(s, 'README.md')) },
      async () => { await fs.writeFile(path.join(ws, 'README.md'), 'kept') },
    )
    expect(await fs.readFile(path.join(ws, 'README.md'), 'utf8')).toBe('kept')
  })

  it('never writes through a folder the agent swapped for a link', async () => {
    const result = await run(
      async s => { await fs.writeFile(path.join(s, 'src/secret.txt'), 'overwritten by the run') },
      async () => {
        await fs.rm(path.join(ws, 'src'), { recursive: true })
        await fs.symlink(outside, path.join(ws, 'src'))
      },
    )
    expect(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside the workspace')
    expect(result.conflicts).toEqual([{ path: 'src/secret.txt', keptAs: '' }])
  })

  it('replaces a link the agent put at a file\'s path rather than writing through it', async () => {
    await run(
      async s => { await fs.writeFile(path.join(s, 'notes.txt'), 'new from the run') },
      async () => { await fs.symlink(path.join(outside, 'secret.txt'), path.join(ws, 'notes.txt')) },
    )
    // The agent made the path a link meanwhile: a conflict, and the outside file is untouched.
    expect(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('outside the workspace')
    expect((await fs.lstat(path.join(ws, 'notes.txt'))).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(path.join(ws, 'notes.txt.workflow-run-1'), 'utf8')).toBe('new from the run')
  })

  it('writes a link a step made as a link, never what it points at', async () => {
    await run(async s => { await fs.symlink(path.join(outside, 'secret.txt'), path.join(s, 'made-by-step')) })
    const entry = await fs.lstat(path.join(ws, 'made-by-step'))
    expect(entry.isSymbolicLink()).toBe(true)
  })

  it('finds a change by content even when the step sets the time back', async () => {
    const before = await fs.stat(path.join(ws, 'src/app.js'))
    const result = await run(async s => {
      const p = path.join(s, 'src/app.js')
      await fs.writeFile(p, 'console.log(9)')
      await fs.utimes(p, before.atime, before.mtime)
    })
    expect(result.changed).toEqual(['src/app.js'])
  })
})
