import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { decideTags, main } from '../pin-screenshots.mjs'

const url = (tag, name) => `https://github.com/solution84-com/agenthix/releases/download/${tag}/${name}.png`

describe('the tag each screenshot is pinned to @SC-1924', () => {
  it('is the upcoming tag for a new or changed screenshot, and the release that holds it for an unchanged one', () => {
    const result = { new: ['fresh'], changed: ['moved'], unchanged: ['same'], removed: ['gone'] }
    const heldBy = new Map([['moved', 'v0.1.0'], ['same', 'v0.1.0'], ['gone', 'v0.1.0']])
    expect(decideTags({ result, heldBy, upcoming: 'v0.2.0' })).toEqual(new Map([
      ['fresh', 'v0.2.0'],
      ['moved', 'v0.2.0'],
      ['same', 'v0.1.0'],
    ]))
  })
})

function solid([r, g, b]) {
  const png = new PNG({ width: 40, height: 40 })
  for (let i = 0; i < 40 * 40; i++) png.data.set([r, g, b, 255], i * 4)
  return PNG.sync.write(png)
}

describe('the pin step, with its git and network calls stood in for @SC-1924 @SC-1925', () => {
  const roots = []
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
  const white = solid([255, 255, 255])
  const black = solid([0, 0, 0])

  function repo(pages, captures) {
    const root = mkdtempSync(join(tmpdir(), 'guide-pin-'))
    roots.push(root)
    for (const [path, text] of Object.entries(pages)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const capturesDir = join(root, 'hq/e2e/guide/.captures')
    mkdirSync(capturesDir, { recursive: true })
    for (const [name, png] of Object.entries(captures)) writeFileSync(join(capturesDir, `${name}.png`), png)
    return { root, capturesDir }
  }
  // The last release, v0.1.0, linked home and board to itself, as its pages say.
  const lastPages = { 'docs/guide/a.md': `![H](${url('v0.1.0', 'home')}) ![B](${url('v0.1.0', 'board')})` }
  const git = ({ tags = [] } = {}) => (args) => {
    if (args[0] === 'tag') return tags.join('\n')
    if (args[0] === 'describe') return 'v0.1.0\n'
    if (args[0] === 'ls-tree') return Object.keys(lastPages).join('\n')
    if (args[0] === 'show') return lastPages[args[1].slice('v0.1.0:'.length)]
    throw new Error(`unexpected git ${args.join(' ')}`)
  }
  const released = { 'v0.1.0/home': white, 'v0.1.0/board': white }
  const fetchFn = async (address) => {
    const key = address.split('/download/')[1]?.replace(/\.png$/, '')
    const body = released[key]
    return body ? { status: 200, ok: true, arrayBuffer: async () => body } : { status: 404, ok: false }
  }
  const pin = (root, capturesDir, extra = {}) => main({ repoRoot: root, capturesDir, tag: 'v0.2.0', env: {}, runGit: git(), fetchFn, ...extra })

  it('moves a changed and a new screenshot to the upcoming tag, everywhere, and keeps an unchanged one', async () => {
    const page = `![H](${url('v0.1.0', 'home')}) ![B](${url('v0.1.0', 'board')}) ![N](${url('v0.1.0', 'added')})`
    const readme = `<img src="${url('v0.1.0', 'board')}">`
    const { root, capturesDir } = repo({ 'docs/guide/a.md': page, 'README.md': readme, 'docs/guide/README.md': `![x](${url('v0.1.0', 'board')})` }, { home: white, board: black, added: white })
    const { decisions, files } = await pin(root, capturesDir)
    expect(decisions).toEqual(new Map([['added', 'v0.2.0'], ['board', 'v0.2.0'], ['home', 'v0.1.0']]))
    expect(files.sort()).toEqual(['README.md', 'docs/guide/a.md'])
    expect(readFileSync(join(root, 'docs/guide/a.md'), 'utf8')).toBe(`![H](${url('v0.1.0', 'home')}) ![B](${url('v0.2.0', 'board')}) ![N](${url('v0.2.0', 'added')})`)
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe(`<img src="${url('v0.2.0', 'board')}">`)
    // The writers' notes are never published, and never rewritten.
    expect(readFileSync(join(root, 'docs/guide/README.md'), 'utf8')).toContain(url('v0.1.0', 'board'))
  })

  it('run again, moves a screenshot pinned to the upcoming tag back to its release once it is the same again', async () => {
    const { root, capturesDir } = repo({ 'docs/guide/a.md': `![H](${url('v0.2.0', 'home')})` }, { home: white })
    const { decisions } = await pin(root, capturesDir)
    expect(decisions.get('home')).toBe('v0.1.0')
    expect(readFileSync(join(root, 'docs/guide/a.md'), 'utf8')).toBe(`![H](${url('v0.1.0', 'home')})`)
  })

  it('refuses a tag that is not a release tag, or is already tagged', async () => {
    const { root, capturesDir } = repo({ 'docs/guide/a.md': `![H](${url('v0.1.0', 'home')})` }, { home: white })
    await expect(pin(root, capturesDir, { tag: 'latest' })).rejects.toThrow(/not a release tag/)
    await expect(pin(root, capturesDir, { runGit: git({ tags: ['v0.2.0'] }) })).rejects.toThrow(/v0\.2\.0 is already tagged/)
  })

  it('refuses when a linked screenshot has no capture, and changes nothing', async () => {
    const page = `![H](${url('v0.1.0', 'home')}) ![B](${url('v0.1.0', 'board')})`
    const { root, capturesDir } = repo({ 'docs/guide/a.md': page }, { home: black })
    await expect(pin(root, capturesDir)).rejects.toThrow(/no capture of "board"/)
    expect(readFileSync(join(root, 'docs/guide/a.md'), 'utf8')).toBe(page)
  })

  it('refuses links the name check would refuse', async () => {
    const { root, capturesDir } = repo({ 'docs/guide/a.md': `![H](${url('v0.1.0', 'home')})`, 'docs/guide/b.md': `![H](${url('v0.0.9', 'home')})` }, { home: white })
    await expect(pin(root, capturesDir)).rejects.toThrow(/linked to more than one release/)
  })
})
