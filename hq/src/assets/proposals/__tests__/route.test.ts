import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { landingOf } from '../route'
import { PROPOSE_SKILL_SCHEMA } from '../tool'
import {
  draftCardBody, outcomeBody, outcomeForLead, proposalCardBody, PROPOSE_SKILL_TOOL, skillCardOf,
} from '../types'

describe('where propose_skill lands (H5, D24) @security-H5 @SC-1661', () => {
  it('is the person\'s draft only from their own conversation, where they may edit, for a skill edited in place', () => {
    expect(landingOf({ ownConversation: true, mayEdit: true, editsSigned: false })).toBe('draft')
  })

  it('is a proposal from any other run, even for a person who may edit there (a task run of an administrator)', () => {
    expect(landingOf({ ownConversation: false, mayEdit: true, editsSigned: false })).toBe('proposal')
  })

  it('is a proposal where the person may not edit, and for a skill another publisher signed', () => {
    expect(landingOf({ ownConversation: true, mayEdit: false, editsSigned: false })).toBe('proposal')
    expect(landingOf({ ownConversation: true, mayEdit: true, editsSigned: true })).toBe('proposal')
  })
})

describe('the tool\'s arguments @SC-1661', () => {
  const schema = z.object(PROPOSE_SKILL_SCHEMA.schema)
  const valid = { name: 'x', description: 'd', files: { 'SKILL.md': 'b' }, why: 'w', aim: 'person' }

  it('has no argument that names a person: one sent is dropped', () => {
    const parsed = schema.parse({ ...valid, forUserId: 'someone-else', person: 'someone-else', userId: 'someone-else' })
    expect(Object.keys(parsed).sort()).toEqual(['aim', 'description', 'files', 'name', 'why'])
  })

  it('takes only the three aims', () => {
    expect(schema.safeParse({ ...valid, aim: 'everyone' }).success).toBe(false)
  })
})

describe('the card and the outcome line @SC-1661', () => {
  it('reads back what it wrote, and nothing else', () => {
    expect(skillCardOf(proposalCardBody('p1', 'checkout-review', false))).toEqual({ kind: 'proposal', proposalId: 'p1', name: 'checkout-review' })
    expect(skillCardOf(draftCardBody({ kind: 'place', id: 's1' }, 'x', 3))).toEqual({ kind: 'draft', draft: { kind: 'place', id: 's1' }, name: 'x', revision: 3 })
    expect(skillCardOf({ text: 'Searched', toolName: 'search_knowledge' })).toBeNull()
    expect(skillCardOf({ text: 'x', toolName: PROPOSE_SKILL_TOOL, target: { kind: 'skill_draft', id: 'file:1', label: 'x', params: { revision: '1' } } })).toBeNull()
  })

  it('tells the lead the outcome on its next turn, and nothing for other lines', () => {
    expect(outcomeForLead(outcomeBody('p1', 'checkout-review', 'ACCEPTED', 'Sam Rivera', null)))
      .toBe('[Your proposed skill checkout-review was accepted by Sam Rivera. Agents now use it there.]')
    expect(outcomeForLead(outcomeBody('p1', 'x', 'REJECTED', 'Sam', 'We have one'))).toMatch(/not accepted by Sam: "We have one".*Don't propose it again/)
    expect(outcomeForLead(proposalCardBody('p1', 'x', false))).toBeNull()
  })
})
