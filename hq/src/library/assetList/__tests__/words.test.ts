import { describe, it, expect } from 'vitest'
import { madeFromText, signedByText, titleOfName, whoHasText } from '../words'

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
