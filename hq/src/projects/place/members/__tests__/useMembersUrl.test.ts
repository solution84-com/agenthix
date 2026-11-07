/** Members' place in the address: Add members on a tab, and the older addresses of the three add screens. */
import { describe, it, expect } from 'vitest'
import { membersScreenOf } from '../useMembersUrl'

const of = (query: string) => membersScreenOf(new URLSearchParams(query))

describe('membersScreenOf', () => {
  it('opens Add members on the tab named, People by default', () => {
    expect(of('tool=members&mview=add&tab=agents')).toEqual({ kind: 'list', adding: 'agents' })
    expect(of('tool=members&mview=add&tab=robots')).toEqual({ kind: 'list', adding: 'people' })
    expect(of('tool=members')).toEqual({ kind: 'list', adding: null })
  })

  it('opens the dialog for the older add addresses, so links that name them keep working', () => {
    expect(of('tool=members&pview=add')).toEqual({ kind: 'list', adding: 'people' })
    expect(of('tool=agents&aview=assign')).toEqual({ kind: 'list', adding: 'agents' })
    expect(of('tool=members&mview=add-team')).toEqual({ kind: 'list', adding: 'teams' })
  })

  it('leaves a person or an agent screen to their own tools', () => {
    expect(of('tool=members&person=u1&pview=remove')).toEqual({ kind: 'list', adding: null })
    expect(of('tool=members&agent=a1&aview=remove')).toEqual({ kind: 'list', adding: null })
    expect(of('tool=members&mview=remove-team&team=t1')).toEqual({ kind: 'removeTeam', teamId: 't1' })
  })
})
