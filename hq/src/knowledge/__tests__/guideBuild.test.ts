import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertOnlyGuide, buildPlatformGuide, withoutImages } from '../guideBuild/build'
import { parseGlossary } from '../guideBuild/glossary'

let tmp: string
let guideDir: string
let outDir: string
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(guideDir, rel)), { recursive: true })
  fs.writeFileSync(path.join(guideDir, rel), text)
}
const page = (title: string, description: string | null, body = 'Text.') =>
  `---\ntitle: ${title}\n${description === null ? '' : `description: ${description}\n`}sidebar:\n  order: 2\n---\n\n${body}\n`
const build = () => buildPlatformGuide({ guideDir, outDir, toolsMarkdown: '# tools\n' })
const files = (dir: string, rel = ''): string[] =>
  fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`])).sort()

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-build-'))
  guideDir = path.join(tmp, 'guide')
  outDir = path.join(tmp, 'out', 'platform-guide')
  put('README.md', '# Rules for writing the guide\n')
  put('index.md', page('The guide', 'Where to start.'))
  put('your-tools/providers.md', page('Providers', 'Add a model key.', '![The key form](screenshot:key-form)\n\nPaste the key.'))
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('the platform guide build @SC-1411', () => {
  it('writes the index, the tools reference and every page but the README, images as their alt text', () => {
    const index = build()
    expect(files(outDir)).toEqual(['index.json', 'pages/index.md', 'pages/your-tools/providers.md', 'tools.md'])
    expect(index.pages.map(p => p.name)).toEqual(['index', 'your-tools/providers'])
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')).pages[1]).toEqual({
      name: 'your-tools/providers', title: 'Providers', description: 'Add a model key.',
    })
    expect(fs.readFileSync(path.join(outDir, 'pages/your-tools/providers.md'), 'utf8')).toContain('The key form\n\nPaste the key.')
    expect(fs.readFileSync(path.join(outDir, 'tools.md'), 'utf8')).toBe('# tools\n')
  })

  it('passes without a glossary, and builds one when there is one', () => {
    expect(build().terms).toEqual([])
    expect(fs.existsSync(path.join(outDir, 'glossary.md'))).toBe(false)
    put('glossary.md', page('Glossary', 'Words.', '## Your space\nYour own place.\nAlso said: my space, my stuff.\n\n## HQ\nThe organisation.'))
    const index = build()
    expect(index.terms).toEqual([{ term: 'Your space', also: ['my space', 'my stuff'] }, { term: 'HQ', also: [] }])
    expect(files(outDir)).toContain('glossary.md')
    expect(files(outDir)).not.toContain('pages/glossary.md')
  })

  it('fails on a page without a description, naming it', () => {
    put('people/teams.md', page('Teams', null))
    expect(build).toThrow(/people\/teams\.md has no description/)
    put('people/teams.md', page('Teams', '   '))
    expect(build).toThrow(/people\/teams\.md has no description/)
  })

  it('fails on a glossary that does not parse', () => {
    put('glossary.md', page('Glossary', 'Words.', 'No entries here.'))
    expect(build).toThrow(/no entries/)
    put('glossary.md', page('Glossary', 'Words.', '## Space\nOne.\n\n## space\nTwo.'))
    expect(build).toThrow(/twice/)
    put('glossary.md', page('Glossary', 'Words.', '## Space\n\n## Task\nA task.'))
    expect(build).toThrow(/"Space" has no text/)
  })

  it('fails on front matter that does not parse', () => {
    put('bad.md', '---\ntitle: [unclosed\n---\nText\n')
    expect(build).toThrow(/front matter of bad\.md does not parse/)
  })

  it('replaces whatever an earlier build left in the folder', () => {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'stray.txt'), 'x')
    build()
    expect(files(outDir)).not.toContain('stray.txt')
  })

  it('fails when anything other than the guide is in the folder', () => {
    build()
    fs.writeFileSync(path.join(outDir, 'secrets.env'), 'x')
    expect(() => assertOnlyGuide(outDir, new Set(['index.json', 'tools.md', 'pages/index.md', 'pages/your-tools/providers.md']))).toThrow(/secrets\.env/)
  })

  it('takes only the guide\'s markdown pages, not its other files', () => {
    put('assets/logo.svg', '<svg/>')
    put('notes.txt', 'x')
    build()
    expect(files(outDir).filter(f => !f.startsWith('pages/') )).toEqual(['index.json', 'tools.md'])
    expect(files(outDir)).not.toContain('pages/assets/logo.svg')
  })
})

describe('images and the glossary reader @SC-1411', () => {
  it('replaces an image by its alt text, and an image with none by nothing', () => {
    expect(withoutImages('a ![One two](x.png) b ![](y.png) c')).toBe('a One two b  c')
  })

  it('ignores a heading inside a code fence and the text before the first entry', () => {
    const terms = parseGlossary('# Glossary\n\nIntro.\n\n## Word\nMeans a thing.\n\n```\n## not a word\n```\n')
    expect(terms.map(t => t.term)).toEqual(['Word'])
  })
})
