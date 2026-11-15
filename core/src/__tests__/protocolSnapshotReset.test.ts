import { describe, expect, it } from 'vitest'
import { snapshotOf } from './protocolSnapshot/fixture.js'
import { resetProblems } from './protocolSnapshot/rules.js'

const shapes = (version: string, mark = '') => snapshotOf({
  'index.ts': `
    export type Run = {
      id: string
      ${mark ? `/** @deprecated ${mark} */` : ''}
      page?: number
    }
  `,
}, version)

describe('a deliberate reset records a new baseline at 1.0 @SC-2169', () => {
  it('allows shapes at 1.0 that carry no deprecation mark', () => {
    expect(resetProblems(shapes('1.0'))).toEqual([])
  })

  it('refuses a version other than 1.0', () => {
    expect(resetProblems(shapes('1.3'))).toEqual([expect.stringMatching(/fixture: a reset records 1\.0, and the version is 1\.3/)])
    expect(resetProblems(shapes('2.0'))).toEqual([expect.stringMatching(/the version is 2\.0/)])
  })

  it('refuses shapes that still carry a deprecation mark, naming each', () => {
    const problems = resetProblems(shapes('1.0', 'since 1.0; stops working in 3.0. Nothing replaces it.'))
    expect(problems).toEqual([expect.stringMatching(/fixture: Run\.page still carries a deprecation mark/)])
  })
})
