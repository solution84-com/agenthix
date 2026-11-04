/**
 * adr-0173 for the containers that work on part of a boundary: the commit helper and a live preview are given the
 * boundary's whole folder, or a folder of the site's own, never a path below a boundary's folder, which Docker would
 * resolve on this machine through whatever symbolic link (symlink) a run put on the way. And the helper's program
 * refuses a copy that a symlink has moved outside its boundary.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { containerRoots, helperMounts, runHelper, type HelperSpec } from '../helperContainer'
import { copyMount } from '../../livePreviews/container/template'
import { AUTHOR, local, sh, write } from './gitFixture'

let root: string
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'helper-mounts-')))
  process.env.SITE_ROOT = root
})
afterEach(() => {
  delete process.env.SITE_ROOT
  fs.rmSync(root, { recursive: true, force: true })
})

const boundary = () => path.join(root, 'projects', 'p1')
const main = () => path.join(root, 'code', 'projects', 'p1', 'w1')
const COPY = '11111111-1111-4111-8111-111111111111'

/** Whether `source` is below a boundary's folder: what no mount may be. */
const belowABoundary = (source: string) => {
  const rel = path.relative(root, source).split(path.sep)
  return (rel[0] === 'projects' || rel[0] === 'users') && rel.length > 2
}

describe("the commit helper's mounts", () => {
  it("mounts main from the code space and a branch's copy through the boundary's whole folder", () => {
    const spec: HelperSpec = {
      workspaceId: 'w1', ws: { dir: main(), readOnly: false },
      copy: { dir: path.join(boundary(), 'clones', COPY), readOnly: true }, network: false, timeoutMs: 1000,
    }
    const mounts = helperMounts(spec)
    expect(mounts).toEqual([
      { source: main(), target: '/o/main', readOnly: false },
      { source: boundary(), target: '/o/b', readOnly: true },
    ])
    for (const m of mounts) expect(belowABoundary(m.source)).toBe(false)
    expect(containerRoots(spec)).toMatchObject({ copy: `/o/b/clones/${COPY}`, within: '/o/b', wsSeen: '/o/b/workspaces/w1' })
  })

  it("mounts a copy in the site's own data as it is", () => {
    const own = path.join(root, 'live-preview-copies', COPY)
    expect(helperMounts({ workspaceId: 'w1', copy: { dir: own, readOnly: false }, network: false, timeoutMs: 1000 }))
      .toEqual([{ source: own, target: `/o/clones/${COPY}`, readOnly: false }])
  })

  it("refuses a copy that a symbolic link in the boundary moved onto main, and leaves main alone", async () => {
    fs.mkdirSync(main(), { recursive: true })
    write(main(), 'README.md', 'hello\n')
    const init = await runHelper({ workspaceId: 'w1', ws: { dir: main(), readOnly: false }, network: false, timeoutMs: 60_000 },
      { op: 'init', author: AUTHOR, at: new Date().toISOString(), message: 'First version', large: 1 << 20, ignored: [] }, local)
    expect(init.refused).toBeUndefined()
    const before = sh(main(), ['rev-parse', 'HEAD'])
    fs.mkdirSync(path.join(boundary(), 'clones'), { recursive: true })
    fs.symlinkSync(main(), path.join(boundary(), 'clones', COPY))

    const answer = await runHelper({
      workspaceId: 'w1', ws: { dir: main(), readOnly: true },
      copy: { dir: path.join(boundary(), 'clones', COPY), readOnly: false }, network: false, timeoutMs: 60_000,
    }, { op: 'removeCopy' }, local)

    expect(answer.refused).toBe('no_copy')
    expect(fs.readFileSync(path.join(main(), 'README.md'), 'utf8')).toBe('hello\n')
    expect(sh(main(), ['rev-parse', 'HEAD'])).toBe(before)
  })
})

describe("a live preview's mount", () => {
  it("is the boundary's whole folder at its usual place for a branch's copy, and the copy's own folder for main's", () => {
    expect(copyMount({ hostDir: path.join(boundary(), 'clones', COPY), containerDir: `/projects/p1/clones/${COPY}` }))
      .toEqual({ source: boundary(), target: '/projects/p1', readOnly: false })
    const own = path.join(root, 'live-preview-copies', COPY)
    expect(copyMount({ hostDir: own, containerDir: `/main/${COPY}` })).toEqual({ source: own, target: `/main/${COPY}`, readOnly: false })
  })
})
