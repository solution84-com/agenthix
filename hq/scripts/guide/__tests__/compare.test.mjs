import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { classify, compareCaptures, diffImages, lastReleaseTag, main, renderSummary } from '../compare.mjs'
import { githubToken, releaseImages } from '../releaseImages.mjs'

function solid(width, height, [r, g, b], dots = []) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r
    png.data[i * 4 + 1] = g
    png.data[i * 4 + 2] = b
    png.data[i * 4 + 3] = 255
  }
  for (const [x, y] of dots) {
    const at = (y * width + x) * 4
    png.data[at] = png.data[at + 1] = png.data[at + 2] = 0
  }
  return PNG.sync.write(png)
}

const white = solid(100, 100, [255, 255, 255])
const black = solid(100, 100, [0, 0, 0])

describe('diffImages @SC-804 @SC-805', () => {
  it('treats identical images as unchanged', () => {
    expect(diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255])).changed).toBe(false)
  })
  it('ignores a difference of a few pixels', () => {
    const result = diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255], [[1, 1], [50, 50], [90, 20]]))
    expect(result.pixels).toBe(3)
    expect(result.changed).toBe(false)
  })
  it('reports a larger difference as changed', () => {
    const dots = []
    for (let x = 0; x < 100; x++) dots.push([x, 10])
    const result = diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255], dots))
    expect(result.changed).toBe(true)
    expect(result.pixels).toBe(100)
  })
  it('reports different sizes as changed', () => {
    expect(diffImages(solid(100, 100, [255, 255, 255]), solid(100, 120, [255, 255, 255])).changed).toBe(true)
  })
})

describe('classify @SC-804 @SC-806', () => {
  const same = { changed: false, pixels: 0 }
  const different = { changed: true, pixels: 500 }

  it('calls a capture with no earlier release new', () => {
    const result = classify({ captureNames: ['a', 'b'], baselineNames: [], compared: new Map() })
    expect(result.new).toEqual(['a', 'b'])
    expect(result.changed).toEqual([])
    expect(result.removed).toEqual([])
  })
  it('sorts each capture into new, changed or unchanged', () => {
    const compared = new Map([['a', null], ['b', different], ['c', same]])
    const result = classify({ captureNames: ['a', 'b', 'c'], baselineNames: ['b', 'c'], compared })
    expect(result.new).toEqual(['a'])
    expect(result.changed).toEqual(['b'])
    expect(result.unchanged).toEqual(['c'])
  })
  it('calls a baseline name with no capture removed', () => {
    const result = classify({ captureNames: ['a'], baselineNames: ['a', 'gone'], compared: new Map([['a', same]]) })
    expect(result.removed).toEqual(['gone'])
  })
})

describe('lastReleaseTag @SC-806', () => {
  it('returns the tag git describes', () => {
    expect(lastReleaseTag(() => 'v1.2.0\n')).toBe('v1.2.0')
  })
  it('returns null when git finds no release tag', () => {
    expect(lastReleaseTag(() => { throw new Error('No names found') })).toBeNull()
    expect(lastReleaseTag(() => '')).toBeNull()
  })
})

describe('renderSummary @SC-806 @SC-807', () => {
  it('says there is no earlier release', () => {
    const text = renderSummary({ tag: null, result: { new: ['a'], changed: [], removed: [], unchanged: [] }, pixels: new Map() })
    expect(text).toContain('No earlier release')
    expect(text).toContain('`a`')
  })
  it('lists changed, new and removed under the tag', () => {
    const text = renderSummary({
      tag: 'v1.0.0',
      result: { new: ['n'], changed: ['c'], removed: ['r'], unchanged: ['u'] },
      pixels: new Map([['c', 500]]),
    })
    expect(text).toContain('v1.0.0')
    expect(text).toMatch(/Changed \(1\)[\s\S]*`c`[\s\S]*500/)
    expect(text).toMatch(/New \(1\)[\s\S]*`n`/)
    expect(text).toMatch(/Removed \(1\)[\s\S]*`r`/)
    expect(text).toMatch(/1 unchanged/)
  })
})

const url = (tag, name) => `https://github.com/solution84-com/agenthix/releases/download/${tag}/${name}.png`
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, arrayBuffer: async () => body, json: async () => body })

describe("a released screenshot, read from the release its link names @SC-1152", () => {
  it('is fetched from its address when there is no token, and is missing on a 404', async () => {
    const asked = []
    const image = releaseImages({ token: '', fetchFn: async (address) => { asked.push(address); return address.includes('home') ? reply(200, white) : reply(404) } })
    expect((await image('v0.1.0', 'home')).equals(white)).toBe(true)
    expect(await image('v0.1.0', 'board')).toBeNull()
    expect(asked).toEqual([url('v0.1.0', 'home'), url('v0.1.0', 'board')])
  })

  it('is read through the API with the token, the release looked up once, and missing when the release or its asset is', async () => {
    const asked = []
    const fetchFn = async (address, init) => {
      asked.push([address, init?.headers?.Accept, init?.headers?.Authorization])
      if (address.endsWith('/releases/tags/v0.1.0')) return reply(200, { assets: [{ name: 'home.png', url: 'https://api.github.com/assets/1' }] })
      if (address.endsWith('/releases/tags/v0.2.0')) return reply(404)
      if (address === 'https://api.github.com/assets/1') return reply(200, white)
      throw new Error(address)
    }
    const image = releaseImages({ token: 't0k', fetchFn })
    expect((await image('v0.1.0', 'home')).equals(white)).toBe(true)
    expect(await image('v0.1.0', 'board')).toBeNull()
    expect(await image('v0.2.0', 'home')).toBeNull()
    expect(asked.filter(([a]) => a.endsWith('/releases/tags/v0.1.0'))).toHaveLength(1)
    expect(asked).toContainEqual(['https://api.github.com/assets/1', 'application/octet-stream', 'Bearer t0k'])
  })

  it('uses GH_TOKEN, else GITHUB_TOKEN, else none', () => {
    expect(githubToken({ GH_TOKEN: 'a', GITHUB_TOKEN: 'b' })).toBe('a')
    expect(githubToken({ GH_TOKEN: ' ', GITHUB_TOKEN: 'b' })).toBe('b')
    expect(githubToken({})).toBe('')
  })

  it('fails, naming the picture, on any other answer', async () => {
    await expect(releaseImages({ token: '', fetchFn: async () => reply(503) })('v0.1.0', 'home')).rejects.toThrow(/"home" in v0\.1\.0 failed: HTTP 503/)
  })
})

describe('comparing captures with the releases their links name @SC-804', () => {
  const dir = () => {
    const root = mkdtempSync(join(tmpdir(), 'guide-captures-'))
    return root
  }
  it('compares with the tag the page links, then with the last release\'s link when that release does not hold it', async () => {
    const capturesDir = dir()
    writeFileSync(join(capturesDir, 'home.png'), white)
    writeFileSync(join(capturesDir, 'board.png'), black)
    writeFileSync(join(capturesDir, 'added.png'), white)
    const held = { 'v0.1.0/home': white, 'v0.1.0/board': white, 'v0.1.0/gone': white }
    const fetchImage = async (tag, name) => held[`${tag}/${name}`] ?? null
    const current = new Map([['home', 'v0.2.0'], ['board', 'v0.1.0'], ['added', 'v0.2.0']])
    const previous = new Map([['home', 'v0.1.0'], ['board', 'v0.1.0'], ['gone', 'v0.1.0']])
    const { result, heldBy } = await compareCaptures({ capturesDir, current, previous, fetchImage })
    rmSync(capturesDir, { recursive: true, force: true })
    expect(result).toEqual({ new: ['added'], changed: ['board'], unchanged: ['home'], removed: ['gone'] })
    expect(heldBy).toEqual(new Map([['board', 'v0.1.0'], ['home', 'v0.1.0'], ['gone', 'v0.1.0']]))
  })
})

describe('the comparison run, with its git and network calls stood in for', () => {
  const roots = []
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

  function repoWith(page, captures) {
    const root = mkdtempSync(join(tmpdir(), 'guide-compare-'))
    roots.push(root)
    mkdirSync(join(root, 'docs/guide'), { recursive: true })
    writeFileSync(join(root, 'docs/guide/a.md'), page)
    mkdirSync(join(root, 'hq/e2e/guide/.captures'), { recursive: true })
    for (const [name, png] of Object.entries(captures)) writeFileSync(join(root, 'hq/e2e/guide/.captures', `${name}.png`), png)
    return join(root, 'hq')
  }
  const git = (tag, lastPage = '') => (args) => {
    if (args[0] === 'describe') {
      if (tag === null) throw new Error('no tag')
      return `${tag}\n`
    }
    if (args[0] === 'ls-tree') return lastPage ? 'docs/guide/a.md\n' : ''
    if (args[0] === 'show') return lastPage
    throw new Error(`unexpected git ${args.join(' ')}`)
  }

  it('says every screenshot is new when there is no earlier release, and fetches nothing', async () => {
    const hqRoot = repoWith(`![H](${url('v0.1.0', 'home')})`, { home: white })
    const calls = []
    const summary = await main({ hqRoot, env: {}, runGit: git(null), fetchFn: async (address) => { calls.push(address); return reply(200, white) } })
    expect(summary).toContain('No earlier release to compare with')
    expect(summary).toContain('### New (1)')
    expect(calls).toEqual([])
  })

  it('counts a screenshot the release its link names does not hold as new', async () => {
    const hqRoot = repoWith(`![H](${url('v0.1.0', 'home')})`, { home: white })
    const summary = await main({ hqRoot, env: {}, runGit: git('v0.1.0'), fetchFn: async () => reply(404) })
    expect(summary).toContain('### New (1)')
    expect(summary).toContain('the last release is `v0.1.0`')
  })

  it('reports an image that differs as changed and writes the old and new side by side', async () => {
    const hqRoot = repoWith(`![H](${url('v0.1.0', 'home')})`, { home: black })
    const urls = []
    const summary = await main({ hqRoot, env: {}, runGit: git('v0.1.0'), fetchFn: async (address) => { urls.push(address); return reply(200, white) } })
    expect(summary).toContain('### Changed (1)')
    expect(urls).toEqual([url('v0.1.0', 'home')])
    expect(readFileSync(join(hqRoot, 'e2e/guide/.report/old/home.png')).equals(white)).toBe(true)
    expect(readFileSync(join(hqRoot, 'e2e/guide/.report/new/home.png')).equals(black)).toBe(true)
  })

  it('lists a screenshot the last release linked and this run did not capture as removed', async () => {
    const hqRoot = repoWith(`![H](${url('v0.1.0', 'home')})`, { home: white })
    const lastPage = `![H](${url('v0.1.0', 'home')}) ![G](${url('v0.1.0', 'gone')})`
    const summary = await main({ hqRoot, env: {}, runGit: git('v0.1.0', lastPage), fetchFn: async () => reply(200, white) })
    expect(summary).toMatch(/Removed \(1\)[\s\S]*`gone`/)
    expect(summary).toContain('1 unchanged')
  })

  it('fails, naming the image, when the release answers with anything but an image or a 404', async () => {
    const hqRoot = repoWith(`![H](${url('v0.1.0', 'home')})`, { home: white })
    await expect(main({ hqRoot, env: {}, runGit: git('v0.1.0'), fetchFn: async () => reply(503) })).rejects.toThrow(/"home" in v0\.1\.0 failed: HTTP 503/)
  })
})
