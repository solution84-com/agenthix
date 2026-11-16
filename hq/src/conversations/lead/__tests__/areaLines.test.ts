/**
 * The area lines (lean agent context spec, §3; the owner's change of 16 Nov 2026): the lead's instructions name every
 * tool it finds by search, grouped by area, after the rules for tools, with the rule to search before saying something
 * can't be done; nothing when nothing is folded.
 */
import { describe, expect, it } from 'vitest'
import type { FoldedName } from '@agenthix/core'
import { leadBaseInstructions } from '../instructions'

const lead = (foldedTools?: readonly FoldedName[]) =>
  leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'the Shop project', ...(foldedTools ? { foldedTools } : {}) })

describe("the lead's area lines @SC-2171", () => {
  it('name each folded tool under its area, before its background work', () => {
    const text = lead([{ name: 'add_comment', area: 'tasks' }, { name: 'open_board', area: 'planning' }, { name: 'plan_task', area: 'planning' }])
    expect(text).toContain('- tasks: add_comment\n- planning boards, sprints and milestones: open_board, plan_task')
    expect(text).not.toContain('knowledge pages:')
    expect(text).toContain("Before telling the person something can't be done, search for a tool with find_tools.")
    expect(text.indexOf('- tasks: add_comment')).toBeLessThan(text.indexOf('Your background work is you'))
  })

  it('are left out when nothing is folded', () => {
    expect(lead()).not.toContain('find_tools')
    expect(lead([])).toBe(lead())
  })
})
