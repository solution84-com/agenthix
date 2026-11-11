import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { main, missingFrom } from '../release-screenshots.mjs'

const url = (tag, name) => `https://github.com/solution84-com/agenthix/releases/download/${tag}/${name}.png`

describe('the screenshots a release carries @SC-1926', () => {
  it('names each one the set lacks', () => {
    expect(missingFrom(['home', 'board'], ['home', 'other'])).toEqual(['board'])
    expect(missingFrom(['home'], ['home'])).toEqual([])
  })

  const roots = []
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
  function repo(pages, set) {
    const root = mkdtempSync(join(tmpdir(), 'guide-release-'))
    roots.push(root)
    for (const [path, text] of Object.entries(pages)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    mkdirSync(join(root, 'set'))
    for (const name of set) writeFileSync(join(root, 'set', `${name}.png`), name)
    return root
  }

  it('are exactly those whose links name its tag, taken from the set', () => {
    const root = repo(
      { 'docs/guide/a.md': `![H](${url('v0.2.0', 'home')}) ![B](${url('v0.1.0', 'board')})`, 'README.md': `<img src="${url('v0.2.0', 'library')}">` },
      ['home', 'board', 'library', 'extra'],
    )
    const names = main({ repoRoot: root, tag: 'v0.2.0', setDir: join(root, 'set'), outDir: join(root, 'out') })
    expect(names).toEqual(['home', 'library'])
    expect(readdirSync(join(root, 'out')).sort()).toEqual(['home.png', 'library.png'])
  })

  it('are none when no link names the tag', () => {
    const root = repo({ 'docs/guide/a.md': `![H](${url('v0.1.0', 'home')})` }, ['home'])
    expect(main({ repoRoot: root, tag: 'v0.2.0', setDir: join(root, 'set'), outDir: join(root, 'out') })).toEqual([])
  })

  it('fail, naming it, when one is missing from the set, and copy nothing', () => {
    const root = repo({ 'docs/guide/a.md': `![H](${url('v0.2.0', 'home')}) ![B](${url('v0.2.0', 'board')})` }, ['home'])
    expect(() => main({ repoRoot: root, tag: 'v0.2.0', setDir: join(root, 'set'), outDir: join(root, 'out') })).toThrow(/"board"/)
    expect(existsSync(join(root, 'out'))).toBe(false)
  })
})
