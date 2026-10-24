import { describe, expect, it } from 'vitest'
import { usedByMap } from '../usedBy'
import { rotationNotice, rotationState } from '../rotation'

describe('usedByMap', () => {
  const versions = [
    {
      workflowId: 'w2', workflowName: 'restart-worker', enabled: false, githubSecretNames: [],
      definition: { steps: [{ secrets: ['KEY'] }, { secrets: ['KEY', 'GITHUB_TOKEN'] }], variables: ['HOST'] },
    },
    {
      workflowId: 'w1', workflowName: 'deploy-staging', enabled: true, githubSecretNames: ['NPM_PUBLISH'],
      definition: { steps: [{ secrets: ['KEY'] }], variables: ['HOST', 'REGION'] },
    },
    { workflowId: 'w3', workflowName: 'odd', enabled: true, githubSecretNames: [], definition: { steps: 'not a list', variables: [1] } },
  ]

  it('lists each workflow once per secret, by name', () => {
    const secrets = usedByMap(versions, 'secret')
    expect(secrets.get('KEY')?.map(w => w.name)).toEqual(['deploy-staging', 'restart-worker'])
    expect(secrets.get('NPM_PUBLISH')?.map(w => w.id)).toEqual(['w1'])
    expect(secrets.get('GITHUB_TOKEN')?.map(w => w.id)).toEqual(['w2'])
    expect(secrets.has('HOST')).toBe(false)
  })

  it('reads variables from the definition only, and nothing from a shape it does not know', () => {
    const variables = usedByMap(versions, 'variable')
    expect(variables.get('HOST')?.map(w => [w.name, w.enabled])).toEqual([['deploy-staging', true], ['restart-worker', false]])
    expect([...variables.keys()].sort()).toEqual(['HOST', 'REGION'])
  })
})

describe('rotation', () => {
  const by = new Date('2026-11-10T15:00:00Z')

  it('is due a week before the day, and overdue from the start of it', () => {
    expect(rotationState(null, new Date('2026-11-10T00:00:00Z'))).toBe('none')
    expect(rotationState(by, new Date('2026-11-02T23:59:00Z'))).toBe('none')
    expect(rotationState(by, new Date('2026-11-03T00:00:00Z'))).toBe('due_soon')
    expect(rotationState(by, new Date('2026-11-09T23:59:00Z'))).toBe('due_soon')
    expect(rotationState(by, new Date('2026-11-10T00:00:00Z'))).toBe('overdue')
  })

  it('says which secret and when, and nothing of its value', () => {
    expect(rotationNotice({ name: 'KEY', rotateBy: by }, 'due_soon', '/x').title).toBe('KEY is due to be replaced by 2026-11-10')
    expect(rotationNotice({ name: 'KEY', rotateBy: by }, 'overdue', '/x')).toMatchObject({
      title: 'KEY is overdue to be replaced', dismissible: false, actionUrl: '/x',
    })
  })
})
