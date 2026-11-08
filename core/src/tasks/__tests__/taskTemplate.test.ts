import { describe, expect, it } from 'vitest'
import { TaskTemplateError, readTaskTemplate, taskTemplateInstallPlan } from '../taskTemplate.js'

const contentPiece = {
  name: 'Content piece', icon: 'document',
  columns: [
    { name: 'Idea', state: 'BACKLOG' }, { name: 'Planned', state: 'TODO' },
    { name: 'Drafting', state: 'IN_PROGRESS', default: true, colour: 'accent' }, { name: 'Editing', state: 'IN_PROGRESS' },
    { name: 'Published', state: 'DONE', colour: 'success' },
  ],
}
const channel = { name: 'Channel', type: 'SINGLE_SELECT', options: [{ name: 'Blog' }, { name: 'Newsletter', colour: 'accent' }, { name: 'Social' }] }

const message = (raw: unknown): string => {
  try { readTaskTemplate(raw) } catch (e) { if (e instanceof TaskTemplateError) return e.message; throw e }
  return ''
}

describe('a task template\'s content', () => {
  it('reads types with their columns and fields with their options', () => {
    const t = readTaskTemplate({ types: [contentPiece], fields: [channel] })
    expect(t.types[0]!.columns.map(c => [c.name, c.state, c.defaultForState, c.colour])).toEqual([
      ['Idea', 'BACKLOG', true, 'neutral'], ['Planned', 'TODO', true, 'neutral'],
      ['Drafting', 'IN_PROGRESS', true, 'accent'], ['Editing', 'IN_PROGRESS', false, 'neutral'], ['Published', 'DONE', true, 'success'],
    ])
    expect(t.fields).toEqual([{ name: 'Channel', type: 'SINGLE_SELECT', options: [
      { name: 'Blog', colour: 'neutral' }, { name: 'Newsletter', colour: 'accent' }, { name: 'Social', colour: 'neutral' },
    ] }])
  })

  it('holds types only, or fields only, but not nothing', () => {
    expect(readTaskTemplate({ types: [contentPiece] }).fields).toEqual([])
    expect(readTaskTemplate({ fields: [channel] }).types).toEqual([])
    expect(message({})).toMatch(/at least one type or one field/)
  })

  it('refuses a type missing a state, or with two defaults in one', () => {
    expect(message({ types: [{ name: 'Bug', columns: [{ name: 'New', state: 'BACKLOG' }] }] })).toMatch(/To do needs at least one column/)
    const twoDefaults = { ...contentPiece, columns: contentPiece.columns.map(c => ({ ...c, default: true })) }
    expect(message({ types: [twoDefaults] })).toMatch(/In progress needs exactly one default column/)
  })

  it('refuses Task and Epic, which every project has', () => {
    expect(message({ types: [{ ...contentPiece, name: 'epic' }] })).toMatch(/every project has/)
  })

  it('refuses what is not text, a colour it does not know, a state it does not know, and two of one name', () => {
    expect(message({ types: [{ ...contentPiece, name: 'a\nb' }] })).toMatch(/one line of text/)
    expect(message({ fields: [{ ...channel, options: [{ name: 'X', colour: '#ff0000' }] }] })).toMatch(/"colour" is one of/)
    expect(message({ types: [{ ...contentPiece, columns: [...contentPiece.columns, { name: 'Gone', state: 'ARCHIVED' }] }] })).toMatch(/"state" is one of/)
    expect(message({ types: [contentPiece, { ...contentPiece, name: 'CONTENT PIECE' }] })).toMatch(/two types are named/)
    expect(message({ fields: [{ ...channel, options: [{ name: 'A' }, { name: 'a' }] }] })).toMatch(/two options of field 1/)
    expect(message({ fields: [{ ...channel, type: 'TEXT' }] })).toMatch(/"type" is one of SINGLE_SELECT/)
    expect(message({ types: [{ ...contentPiece, icon: '../x' }] })).toMatch(/"icon"/)
  })

  it('bounds every list', () => {
    expect(message({ types: Array.from({ length: 31 }, (_, i) => ({ ...contentPiece, name: `T${i}` })) })).toMatch(/at most 30/)
    expect(message({ fields: [{ ...channel, options: Array.from({ length: 31 }, (_, i) => ({ name: `O${i}` })) }] })).toMatch(/at most 30/)
  })
})

describe('installing a task template', () => {
  it('adds what the project lacks and leaves alone a type or field of the same name, ignoring case', () => {
    const t = readTaskTemplate({ types: [contentPiece], fields: [channel] })
    const plan = taskTemplateInstallPlan(t, { typeNames: ['Task', 'Epic'], fieldNames: ['channel'] })
    expect(plan.addsTypes.map(x => x.name)).toEqual(['Content piece'])
    expect(plan.keepsTypes).toEqual([])
    expect(plan.addsFields).toEqual([])
    expect(plan.keepsFields).toEqual(['Channel'])
  })
})
