import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StateFolder } from '../folder'

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('a state file written whole', () => {
  it('is flushed to disk before it replaces the old one, and its folder after', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-folder-'))
    dirs.push(dir)
    const state = new StateFolder(path.join(dir, 'state'))
    state.prepare()
    const order: string[] = []
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { order.push('fsync') })
    const rename = fs.renameSync.bind(fs)
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { order.push('rename'); rename(from, to) })
    state.writeJson(['installation.json'], { a: 1 })
    expect(order).toEqual(['fsync', 'rename', 'fsync'])
    expect(sync).toHaveBeenCalledTimes(2)
    expect(state.readJson('installation.json')).toEqual({ a: 1 })
  })
})
