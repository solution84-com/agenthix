import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_MUST_HAVES, FIND_TOOLS, RUN_MUST_HAVES, USE_TOOL, areaLines, inputRefusal, nothingFoundNote, notAToolRefusal,
} from '../toolSearch.js'

describe('the tool search contract @SC-2171', () => {
  it('shows find_tools and use_tool in both surfaces', () => {
    for (const set of [CONVERSATION_MUST_HAVES, RUN_MUST_HAVES]) {
      expect(set).toContain(FIND_TOOLS)
      expect(set).toContain(USE_TOOL)
      expect(new Set(set).size).toBe(set.length)
    }
    expect(CONVERSATION_MUST_HAVES).toHaveLength(16)
  })

  it('names every folded tool once, grouped by area in a fixed order, and the rule to search', () => {
    const lines = areaLines([
      { name: 'edit_knowledge', area: 'knowledge' }, { name: 'open_board', area: 'planning' },
      { name: 'plan_task', area: 'planning' }, { name: 'open_board', area: 'planning' },
    ])
    expect(lines).toContain('- planning boards, sprints and milestones: open_board, plan_task\n- knowledge pages: edit_knowledge')
    expect(lines).not.toContain('people, agents')
    expect(lines).toContain("Before telling the person something can't be done, search for a tool with find_tools.")
  })

  it('says nothing when nothing is folded', () => {
    expect(areaLines([])).toBe('')
  })

  it('sends the agent back to the names it was given when nothing is found, and says to search when a name is refused', () => {
    expect(nothingFoundNote()).toMatch(/named in your instructions\. If none of those names does it, do not search again: tell the person/)
    expect(nothingFoundNote()).not.toMatch(/areas|other words/)
    const refusal = inputRefusal({ name: 'plan_task', description: 'Plan one task.', input: { type: 'object' } }, 'taskId: Required')
    expect(refusal).toBe('The input does not fit plan_task: taskId: Required. Nothing was run. plan_task: Plan one task. Its input: {"type":"object"}. Call use_tool again with input that fits.')
    expect(notAToolRefusal('add_comment')).toMatch(/^add_comment is not a tool you can use here\. Search with find_tools/)
  })
})
