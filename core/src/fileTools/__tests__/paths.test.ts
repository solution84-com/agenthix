import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveInsideRoot } from '../paths.js'
import { FILE_TOOL_REFUSALS, refusalMessage } from '../refusals.js'
import { tempDir } from './helpers.js'

function folder() {
  const outside = tempDir()
  fs.writeFileSync(path.join(outside, 'secret.md'), 'TOPSECRET')
  const root = tempDir()
  fs.mkdirSync(path.join(root, 'notes'))
  fs.writeFileSync(path.join(root, 'notes', 'a.md'), 'a')
  return { root, outside }
}

describe('a name resolved inside its root @SC-1369', () => {
  it('gives the path inside the root, for a file there and one not there yet', () => {
    const { root } = folder()
    expect(resolveInsideRoot(root, 'notes/a.md')).toEqual({ ok: true, path: path.join(root, 'notes', 'a.md') })
    expect(resolveInsideRoot(root, './notes//new/b.md')).toEqual({ ok: true, path: path.join(root, 'notes', 'new', 'b.md') })
    expect(resolveInsideRoot(root, '')).toEqual({ ok: true, path: root })
  })

  it('resolves inside the real root when the root is reached through a link', () => {
    const { root } = folder()
    const via = path.join(tempDir(), 'via')
    fs.symlinkSync(root, via)
    expect(resolveInsideRoot(via, 'notes/a.md')).toEqual({ ok: true, path: path.join(root, 'notes', 'a.md') })
  })

  it('refuses a name leaving its root', () => {
    const { root } = folder()
    for (const name of ['../secret.md', 'notes/../../secret.md', '..', 'notes/..', '/etc/passwd', '\\\\server\\share', 'C:\\x', 'c:/x']) {
      expect(resolveInsideRoot(root, name)).toMatchObject({ ok: false, reason: 'outside-root' })
    }
  })

  it('refuses a NUL, and a name that is not a string', () => {
    const { root } = folder()
    expect(resolveInsideRoot(root, 'notes/a.md\0.txt')).toMatchObject({ ok: false, reason: 'invalid-name' })
    expect(resolveInsideRoot(root, 42 as unknown as string)).toMatchObject({ ok: false, reason: 'invalid-name' })
    expect(resolveInsideRoot(root, 'a'.repeat(5000))).toMatchObject({ ok: false, reason: 'invalid-name' })
  })

  it('refuses a link on the way, at the end, and one leading to a missing place', () => {
    const { root, outside } = folder()
    fs.symlinkSync(outside, path.join(root, 'out'))
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'notes', 'link.md'))
    fs.symlinkSync(path.join(outside, 'nothing'), path.join(root, 'dangling'))
    expect(resolveInsideRoot(root, 'out/secret.md')).toMatchObject({ ok: false, reason: 'link' })
    expect(resolveInsideRoot(root, 'notes/link.md')).toMatchObject({ ok: false, reason: 'link' })
    expect(resolveInsideRoot(root, 'dangling/new.md')).toMatchObject({ ok: false, reason: 'link' })
  })

  it('refuses a root that is not there, keeping the system detail for the log only', () => {
    const missing = path.join(tempDir(), 'gone')
    const r = resolveInsideRoot(missing, 'a.md')
    expect(r).toMatchObject({ ok: false, reason: 'not-found' })
    if (!r.ok) expect(refusalMessage(r.reason)).not.toContain(missing)
  })
})

describe('the refusals @SC-1373', () => {
  it('are fixed messages, naming no path or system error, each ending "Nothing was changed."', () => {
    for (const [reason, message] of Object.entries(FILE_TOOL_REFUSALS)) {
      expect(message, reason).toMatch(/Nothing was changed\.$/)
      expect(message, reason).not.toMatch(/\/(tmp|proc|home|var|private)\b|E[A-Z]{3,}/)
    }
  })

  it('say how many times a passage was found', () => {
    expect(refusalMessage('edit-ambiguous', 3)).toContain('3 times')
  })
})
