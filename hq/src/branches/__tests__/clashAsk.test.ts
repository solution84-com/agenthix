import { describe, expect, it } from 'vitest'
import { clashAskText } from '../clashAsk'

describe('what the agent is asked after a clash @SC-1680', () => {
  it('names the files, the version of main that changed each, and what to do', () => {
    const text = clashAskText('add-login-page', 'main', [
      { path: 'src/login.ts', version: { number: 12, commit: 'b'.repeat(40), subject: 'Ada for Mia · Sign-up form' } },
      { path: 'README.md', version: null },
    ])
    expect(text).toContain('nothing was merged')
    expect(text).toContain('- src/login.ts (changed on main in v12: Ada for Mia · Sign-up form)')
    expect(text).toContain('- README.md\n')
    expect(text).toContain('tell me here that it is ready to merge')
    expect(text).toContain('Do not merge it yourself')
  })

  it('counts the clashes past twenty', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ path: `f${i}`, version: null }))
    expect(clashAskText('b', 'main', many)).toContain('- and 3 more')
  })
})
