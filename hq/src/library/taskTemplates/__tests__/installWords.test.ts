/** Adding a task template to a project: the button's words and why something of the same name is left alone (D16). */
import { describe, expect, it } from 'vitest'
import type { TaskTemplateContent } from '@agenthix/core'
import { addButtonWords, keptFieldWhy, keptTypeNote, nothingToAddWhy, ownCopyWords } from '../installWords'

const template: TaskTemplateContent = {
  types: [{ name: 'Content piece', icon: 'task', columns: [] }],
  fields: [{ name: 'Channel', type: 'SINGLE_SELECT', options: [{ name: 'Blog', colour: 'neutral' }, { name: 'Newsletter', colour: 'neutral' }, { name: 'Social', colour: 'neutral' }] }],
}
const project = { id: 'p', name: 'Website relaunch' }

describe('adding a task template', () => {
  it('says on the button exactly how many types and fields it adds', () => {
    expect(addButtonWords({ adds: { types: template.types, fields: [] } })).toBe('Add 1 type')
    expect(addButtonWords({ adds: { types: template.types, fields: template.fields } })).toBe('Add 1 type and 1 field')
    expect(addButtonWords({ adds: { types: [], fields: [] } })).toBeNull()
  })

  it('names everything already there when there is nothing to add', () => {
    expect(nothingToAddWhy({ project, keeps: { types: [{ name: 'Content piece', madeFromThis: '1.1.0' }], fields: [{ name: 'Channel', madeFromThis: null, options: [] }] } }))
      .toBe('Website relaunch already has Content piece and Channel')
  })

  it("says a field of the same name keeps its own options, and which of the template's are not added", () => {
    expect(keptFieldWhy({ name: 'Channel', madeFromThis: null, options: ['Website', 'Email', 'Press'] }, project.name, template))
      .toBe('Website relaunch already has a field named Channel, with its own options: Website · Email · Press. It stays as it is; Blog, Newsletter and Social are not added to it.')
  })

  it('says when a type left alone was made from this template', () => {
    expect(keptTypeNote({ name: 'Content piece', madeFromThis: '1.1.0' }, project.name)).toBe("Type · already in Website relaunch, made from this template's 1.1.0")
    expect(ownCopyWords(project.name, 'Content pipeline')).toBe("What it adds is Website relaunch's own: later versions of Content pipeline don't change it. No tasks move.")
  })
})
