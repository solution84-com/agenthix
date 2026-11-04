import { describe, expect, it } from 'vitest'
import { withRunPlaceholders } from '../promptPlaceholders'

const section = (key: string) => ({ key, label: key, content: key, editable: false })

describe('withRunPlaceholders', () => {
  it('adds the skills to a conversation preview, last', () => {
    expect(withRunPlaceholders([section('identity'), section('project')], 'chat').map(s => s.key)).toEqual(['identity', 'project', 'skills'])
  })

  it("adds a task run's new comments before its execution rules, and the skills last", () => {
    const out = withRunPlaceholders([section('task_detail'), section('execution')], 'task')
    expect(out.map(s => s.key)).toEqual(['task_detail', 'new_comments', 'execution', 'skills'])
  })

  it('puts new comments last but one when there are no execution rules to precede', () => {
    expect(withRunPlaceholders([section('identity')], 'task').map(s => s.key)).toEqual(['identity', 'new_comments', 'skills'])
  })
})
