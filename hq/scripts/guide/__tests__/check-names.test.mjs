import { describe, expect, it } from 'vitest'
import { findProblems, isValidName, oldFormProblems, recipeScreenshotName, referencedNames } from '../check-names.mjs'

describe('isValidName @SC-802', () => {
  it('accepts lowercase words joined by hyphens', () => {
    expect(isValidName('project-board')).toBe(true)
    expect(isValidName('board')).toBe(true)
    expect(isValidName('step-2-board')).toBe(true)
  })
  it('rejects anything else', () => {
    for (const name of ['', 'Project-Board', 'project_board', 'project--board', '-board', 'board-', 'project board', 'a.png']) {
      expect(isValidName(name)).toBe(false)
    }
  })
})

describe('recipeScreenshotName @SC-803', () => {
  it('drops the extension and the fresh- prefix', () => {
    expect(recipeScreenshotName('project-board.recipe.ts')).toBe('project-board')
    expect(recipeScreenshotName('fresh-setup-organisation.recipe.ts')).toBe('setup-organisation')
  })
  it('ignores files that are not recipes', () => {
    expect(recipeScreenshotName('helpers.ts')).toBeNull()
    expect(recipeScreenshotName('README.md')).toBeNull()
  })
})

const url = (name, tag = 'v0.1.0') => `https://github.com/solution84-com/agenthix/releases/download/${tag}/${name}.png`

describe('referencedNames @SC-800', () => {
  it('finds every screenshot link in a page', () => {
    const page = `![A](${url('project-board')})\n\ntext ![B](${url('chat-window')} "x") and <img src="${url('project-board', 'v0.2.0')}">`
    expect(referencedNames(page)).toEqual(['project-board', 'chat-window', 'project-board'])
  })
  it('keeps a malformed name so it can be reported', () => {
    expect(referencedNames(`![A](${url('Project_Board')})`)).toEqual(['Project_Board'])
  })
  it('finds nothing in a page without screenshots', () => {
    expect(referencedNames('![Logo](../assets/logo.svg)')).toEqual([])
  })
})

describe('oldFormProblems @SC-800', () => {
  it('names each page still using screenshot:<name>', () => {
    const problems = oldFormProblems(new Map([['docs/guide/a.md', '![A](screenshot:home)'], ['README.md', `![B](${url('home')})`]]))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/docs\/guide\/a\.md refers to "screenshot:home"/)
  })
})

describe('findProblems @SC-800 @SC-801 @SC-802', () => {
  const pages = new Map([
    ['docs/guide/a.md', ['project-board', 'chat-window']],
    ['docs/guide/b.md', ['project-board']],
  ])

  it('is quiet when pages and recipes match', () => {
    expect(findProblems(pages, ['project-board', 'chat-window'])).toEqual([])
  })
  it('names a reference with no recipe, and each page that uses it', () => {
    const problems = findProblems(pages, ['chat-window'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('project-board')
    expect(problems[0]).toContain('docs/guide/a.md')
    expect(problems[0]).toContain('docs/guide/b.md')
  })
  it('names a recipe no page uses', () => {
    const problems = findProblems(pages, ['project-board', 'chat-window', 'unused-one'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('unused-one')
  })
  it('reports a badly formed name once, from either side', () => {
    const problems = findProblems(new Map([['docs/guide/a.md', ['Bad_Name']]]), ['Bad_Name'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Bad_Name')
    expect(problems[0]).toContain('lowercase words joined by hyphens')
  })
  it('reports two recipes that save the same name', () => {
    const problems = findProblems(new Map([['docs/guide/a.md', ['setup-organisation']]]), ['setup-organisation', 'setup-organisation'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('setup-organisation')
  })
})
