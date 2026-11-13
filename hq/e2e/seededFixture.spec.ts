import { test, expect } from '@playwright/test'
import { seedGate } from './fixtures/seeded'

// The fixture every seeded spec uses to skip, or under E2E_REQUIRE_SEEDED=1 to fail, when a seed did not run. It needs
// no hq: the decision is a function of the variables and the environment.
test.describe('a missing seed variable', () => {
  test('lets the tests run when every variable is set', () => {
    expect(seedGate({ A: 'a', B: 'b' }, 'run the seed', { E2E_REQUIRE_SEEDED: '1' })).toEqual({ run: true })
  })

  test('skips them by default', () => {
    expect(seedGate({ A: 'a', B: undefined }, 'run the seed', {})).toEqual({ run: false, fail: false, message: 'run the seed' })
    expect(seedGate({ A: '' }, 'run the seed', { E2E_REQUIRE_SEEDED: '0' })).toMatchObject({ run: false, fail: false })
  })

  test('fails them, naming each missing variable, when the full regression requires the seeds', () => {
    const gate = seedGate({ A: 'a', B: undefined, C: '' }, 'run the seed', { E2E_REQUIRE_SEEDED: '1' })
    expect(gate).toMatchObject({ run: false, fail: true })
    expect(gate).toMatchObject({ message: expect.stringContaining('B, C are not set') })
  })
})
