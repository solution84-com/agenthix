import { describe, expect, it } from 'vitest'
import { placeHeadCrumbs } from '../placeHeadCrumbs'

describe('placeHeadCrumbs', () => {
  it('starts a shared project with Projects, then the project', () => {
    expect(placeHeadCrumbs({ homePath: '/projects/WEB', name: 'Website' }, 'Website')).toEqual([
      { label: 'Projects', href: '/projects' },
      { label: 'Website', href: '/projects/WEB', list: 'projects' },
    ])
  })

  it('has only Projects while the project is loading', () => {
    expect(placeHeadCrumbs(undefined, undefined)).toEqual([{ label: 'Projects', href: '/projects' }])
  })

  it('shows Your space by its own name, not under Projects', () => {
    expect(placeHeadCrumbs({ homePath: '/space', name: 'Your space' }, 'My tasks')).toEqual([
      { label: 'Your space', href: '/space', list: 'projects' },
    ])
  })
})
