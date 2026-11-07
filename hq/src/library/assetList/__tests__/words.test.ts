import { describe, it, expect } from 'vitest'
import { cardPublisherWords, cardTag, madeFromText, needsYou, rowStateWords, signedByText, titleOfName, usedByText, whoHasText } from '../words'
import { row } from '../../components/__tests__/fixtures'

describe('the Library’s row words @SC-1630', () => {
  it('says who has an asset', () => {
    expect(whoHasText([])).toBe('No agent has it yet')
    expect(whoHasText(['Ada'])).toBe('Ada has it')
    expect(whoHasText(['Ada', 'Priya'])).toBe('Ada and Priya have it')
    expect(whoHasText(['Ada', 'Priya', 'Sam'])).toBe('Ada, Priya and Sam have it')
    expect(whoHasText(['Ada', 'Priya', 'Sam', 'Lee', 'Kim'])).toBe('Ada, Priya and 3 more have it')
  })
  it('says who signed it, with where the signer says it is', () => {
    expect(signedByText('Acme', 'https://github.com/acme/skills.git')).toBe('Signed by Acme (github.com/acme/skills)')
    expect(signedByText('Agenthix', null)).toBe('Signed by Agenthix')
  })
  it('says what was made from a template', () => {
    expect(madeFromText('agent', 0)).toBe('None made from it yet')
    expect(madeFromText('agent', 1)).toBe('1 agent made from it')
    expect(madeFromText('team', 3)).toBe('3 teams made from it')
    expect(madeFromText('board', 2)).toBe('Used by 2 projects')
    expect(madeFromText('board', 1)).toBe('Used by 1 project')
    expect(madeFromText('board', 0)).toBe('Not used yet')
  })
  it('titles a template by its folder name', () => expect(titleOfName('sprint-board')).toBe('Sprint board'))
})

describe('a row’s one line of state @SC-1630', () => {
  it('says how many agents use a skill', () => {
    expect(usedByText(0)).toBe('No agent uses it')
    expect(usedByText(1)).toBe('1 agent uses it')
    expect(usedByText(2)).toBe('2 agents use it')
  })

  it('says who made a skill, its version and who uses it', () => {
    expect(rowStateWords(row({ signer: 'Made here', everyAgent: false, agentCount: 2 }))).toBe('Made here · version 1.3.0 · 2 agents use it')
    expect(rowStateWords(row({ everyAgent: true }))).toBe('From Agenthix · version 1.3.0 · every agent uses it')
    expect(rowStateWords(row({ builtIn: true, signer: 'Built in', everyAgent: false }))).toBe('Built in · version 1.3.0 · every agent working in a repository')
  })

  it('says a skill no agent uses, which needs the person', () => {
    const r = row({ signer: 'Made here', everyAgent: false, agentCount: 0, statuses: ['noAgent'] })
    expect(rowStateWords(r)).toBe('Made here · version 1.3.0 · No agent uses it')
    expect(needsYou(r)).toBe(true)
  })

  it('says what a draft and an update wait for', () => {
    expect(rowStateWords(row({ signer: 'Made here', everyAgent: false, agentCount: 1, statuses: ['draft'], draftBy: 'Sam' }))).toContain('Draft by Sam · Edit to finish it')
    expect(rowStateWords(row({ statuses: ['update'], updateTo: '1.4.0' }))).toContain('Update available · 1.4.0')
  })

  it('says how many things use a template', () => {
    expect(rowStateWords(row({ kind: 'board', version: '1.0.0', madeCount: 0 }))).toBe('From Agenthix · not used yet')
    expect(rowStateWords(row({ kind: 'agent', madeCount: 1 }))).toBe('From Agenthix · 1 in use')
  })

  it('says a proposal needs a review', () => {
    const r = row({ assetId: null, proposalId: 'p1', statuses: ['waiting'], proposedBy: 'Proposed by Ada' })
    expect(rowStateWords(r)).toBe('Proposed by Ada · Needs a review')
    expect(needsYou(r)).toBe(true)
  })

  it('does not call an unsigned or set-aside skill a need of the person', () => {
    expect(needsYou(row({ statuses: ['unsigned'] }))).toBe(false)
    expect(needsYou(row({ statuses: ['setAside'] }))).toBe(false)
    expect(rowStateWords(row({ statuses: ['setAside'], setAsideFor: 'fernhill/code-review' }))).toBe('From Agenthix · version 1.3.0 · Set aside, replaced by your copy fernhill/code-review')
  })

  it('says on a card who it is from and its version, and the one tag it needs', () => {
    expect(cardPublisherWords(row({ builtIn: true, signer: 'Built in' }))).toBe('Built in to HQ')
    expect(cardPublisherWords(row({ signer: 'Made here', version: '1.1.0' }))).toBe('Made here · 1.1.0')
    expect(cardPublisherWords(row({ version: null }))).toBe('From Agenthix')
    expect(cardTag(row({ builtIn: true }))).toEqual({ label: 'Built in', needsYou: false, lock: true })
    expect(cardTag(row({ statuses: ['draft'] }))).toEqual({ label: 'Draft · finish it', needsYou: true })
    expect(cardTag(row({ statuses: ['draft', 'update'], updateTo: '2.1.0' }))).toEqual({ label: 'Update 2.1.0', needsYou: true })
    expect(cardTag(row({}))).toBeNull()
  })
})
