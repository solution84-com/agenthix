import { describe, expect, it } from 'vitest'
import {
  isScreenshotPage,
  isVersionTag,
  linkProblems,
  namesLinkedTo,
  oldFormNames,
  parseScreenshotLinks,
  rewriteScreenshotLinks,
  screenshotUrl,
  tagsByName,
} from '../screenshotLinks.mjs'

const url = (tag, name) => `https://github.com/solution84-com/agenthix/releases/download/${tag}/${name}.png`

describe('a screenshot link @SC-800', () => {
  it('is the address of its picture in the release that holds it', () => {
    expect(screenshotUrl('v0.1.0', 'home')).toBe(url('v0.1.0', 'home'))
  })

  it('is read from Markdown images and from HTML, with each name and tag, in order', () => {
    const page = [
      `![Home](${url('v0.1.0', 'home')})`,
      `text ![Board](${url('v0.1.0-alpha.4', 'project-board')} "title") more`,
      `<a href="${url('v0.1.0', 'library')}"><img src="${url('v0.1.0', 'library')}" width="380"></a>`,
    ].join('\n')
    expect(parseScreenshotLinks(page)).toEqual([
      { name: 'home', tag: 'v0.1.0' },
      { name: 'project-board', tag: 'v0.1.0-alpha.4' },
      { name: 'library', tag: 'v0.1.0' },
      { name: 'library', tag: 'v0.1.0' },
    ])
  })

  it('keeps a malformed name or tag so the check can report it', () => {
    expect(parseScreenshotLinks(`![A](${url('latest', 'Project_Board')})`)).toEqual([{ name: 'Project_Board', tag: 'latest' }])
  })

  it('is not any other image, nor another repository\'s release', () => {
    expect(parseScreenshotLinks('![Logo](../assets/logo.svg) ![X](https://github.com/someone/else/releases/download/v1.0.0/home.png)')).toEqual([])
  })

  it('is no longer the old screenshot: form, which is found so it can be reported', () => {
    expect(parseScreenshotLinks('![A](screenshot:home)')).toEqual([])
    expect(oldFormNames('![A](screenshot:home) and ![B](screenshot:project-board "x")')).toEqual(['home', 'project-board'])
  })
})

describe('a release tag @SC-1924', () => {
  it('is v and a version, or a pre-release of one', () => {
    for (const tag of ['v0.1.0', 'v1.2.3', 'v0.1.0-alpha.4', 'v1.0.0-beta.2', 'v1.0.1-rc.1']) expect(isVersionTag(tag)).toBe(true)
  })
  it('is nothing else', () => {
    for (const tag of ['0.1.0', 'v0.1', 'latest', 'v0.1.0-alpha', 'v0.1.0-dev.1', '']) expect(isVersionTag(tag)).toBe(false)
  })
})

describe('the pages that link screenshots', () => {
  it('are the guide pages and the root README, never a README inside the guide', () => {
    expect(isScreenshotPage('README.md')).toBe(true)
    expect(isScreenshotPage('docs/guide/index.md')).toBe(true)
    expect(isScreenshotPage('docs/guide/projects/boards.md')).toBe(true)
    expect(isScreenshotPage('docs/guide/README.md')).toBe(false)
    expect(isScreenshotPage('docs/architecture/deployment.md')).toBe(false)
    expect(isScreenshotPage('hq/README.md')).toBe(false)
  })
})

describe('the tag each screenshot is linked to @SC-802', () => {
  const pages = new Map([
    ['docs/guide/a.md', [{ name: 'home', tag: 'v0.1.0' }, { name: 'board', tag: 'v0.2.0' }]],
    ['README.md', [{ name: 'home', tag: 'v0.1.0' }]],
  ])

  it('is one tag per name across every page', () => {
    expect(tagsByName(pages)).toEqual(new Map([['home', 'v0.1.0'], ['board', 'v0.2.0']]))
    expect(namesLinkedTo(pages, 'v0.1.0')).toEqual(['home'])
    expect(namesLinkedTo(pages, 'v0.3.0')).toEqual([])
  })

  it('is reported when one name is linked to two releases, naming the pages', () => {
    const problems = linkProblems(new Map([...pages, ['docs/guide/b.md', [{ name: 'home', tag: 'v0.2.0' }]]]))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/"home" is linked to more than one release/)
    expect(problems[0]).toContain('docs/guide/b.md')
  })

  it('is reported when the tag is not a release tag', () => {
    const problems = linkProblems(new Map([['docs/guide/a.md', [{ name: 'home', tag: 'latest' }]]]))
    expect(problems).toEqual(['"home" in docs/guide/a.md is linked to "latest", which is not a release tag (v<major>.<minor>.<patch>, or a pre-release of one)'])
  })

  it('is quiet when every name has one release tag', () => {
    expect(linkProblems(pages)).toEqual([])
  })
})

describe('rewriting the links @SC-1925', () => {
  const page = [
    `![Home](${url('v0.1.0', 'home')})`,
    `<a href="${url('v0.1.0', 'board')}"><img src="${url('v0.1.0', 'board')}"></a>`,
    `![Library](${url('v0.1.0', 'library')})`,
    '![Logo](../assets/logo.svg)',
  ].join('\n')

  it('moves each name to its new tag, everywhere it is linked, and leaves everything else as it was', () => {
    const out = rewriteScreenshotLinks(page, new Map([['board', 'v0.2.0'], ['home', 'v0.1.0']]))
    expect(out).toBe(page.replaceAll(url('v0.1.0', 'board'), url('v0.2.0', 'board')))
  })

  it('leaves a page with nothing to move unchanged', () => {
    expect(rewriteScreenshotLinks(page, new Map())).toBe(page)
  })
})
