import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SHARED_FILE_MAX_BYTES, SHARED_FOLDER, type LocationRef } from '@agenthix/core'
import { shareFile } from '../sharedFileWrite'
import { getFilesDir } from '../paths'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'share-file-')))
  process.env.SITE_ROOT = root
})
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const loc: LocationRef = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
const files = () => getFilesDir('project', 'p1')
const shared = () => path.join(files(), SHARED_FOLDER)
const body = Buffer.from('a picture')
const share = (name: string, b: Buffer = body, at: LocationRef = loc, size = b.length) => shareFile({ loc: at, name, size }, b)

describe("writing a shared file into a place's shared folder", () => {
  it('makes the place\'s files and the folder, and writes the file under its name', async () => {
    expect(await share('shot.png')).toEqual({ name: 'shot.png' })
    expect(await fs.readFile(path.join(shared(), 'shot.png'), 'utf-8')).toBe('a picture')
  })

  it('never replaces a file: a second of one name is numbered', async () => {
    await share('shot.png')
    expect(await share('shot.png', Buffer.from('another'))).toEqual({ name: 'shot (2).png' })
    expect(await fs.readFile(path.join(shared(), 'shot.png'), 'utf-8')).toBe('a picture')
  })

  it('does not follow a link planted under the name, and writes beside it', async () => {
    await fs.mkdir(shared(), { recursive: true })
    const outside = path.join(root, 'outside.txt')
    await fs.writeFile(outside, 'keep')
    await fs.symlink(outside, path.join(shared(), 'shot.png'))
    expect(await share('shot.png')).toEqual({ name: 'shot (2).png' })
    expect(await fs.readFile(outside, 'utf-8')).toBe('keep')
  })

  it('refuses a link standing in for the shared folder, writing nothing through it', async () => {
    await fs.mkdir(files(), { recursive: true })
    const elsewhere = path.join(root, 'elsewhere')
    await fs.mkdir(elsewhere)
    await fs.symlink(elsewhere, shared())
    await expect(share('shot.png')).rejects.toThrow(/location-file\/refused/)
    expect(await fs.readdir(elsewhere)).toEqual([])
  })

  it('refuses a file standing for the folder', async () => {
    await fs.mkdir(files(), { recursive: true })
    await fs.writeFile(shared(), 'x')
    await expect(share('shot.png')).rejects.toThrow(/location-file\/not_a_directory/)
  })

  it.each([
    ['a climb', '../escape.png'],
    ['a separator', 'a/b.png'],
    ['a hidden name', '.env'],
    ['no extension', 'shot'],
  ])('refuses a name with %s, writing nothing', async (_what, name) => {
    await expect(share(name)).rejects.toThrow(/location-file\/invalid/)
    expect(await fs.lstat(files()).catch(() => null)).toBeNull()
  })

  it("refuses a workspace's or a task's location, and a stream that does not carry the size named", async () => {
    await expect(share('a.png', body, { ...loc, workspaceId: 'w1' })).rejects.toThrow(/location-file\/invalid/)
    await expect(share('a.png', body, { ...loc, taskId: 't1' })).rejects.toThrow(/location-file\/invalid/)
    await expect(share('a.png', body, loc, body.length + 1)).rejects.toThrow(/location-file\/invalid/)
    await expect(shareFile({ loc, name: 'a.png', size: SHARED_FILE_MAX_BYTES + 1 }, body)).rejects.toThrow(/location-file\/invalid/)
  })
})
