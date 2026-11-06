/** The places in the chat's bar: your space first, then the pinned projects in the person's order, nothing else. */
import { describe, expect, it } from 'vitest'
import { basePathOf, pinnedPlacesOf, placeIdOf, SPACE_PLACE } from '../pinnedPlaces'

describe('the pinned places in the bar', () => {
  it('are your space, then each pinned project in order; pinned boards and agents are left out', () => {
    const places = pinnedPlacesOf([
      { kind: 'PROJECT', itemId: 'p2', name: 'Website relaunch', href: '/projects/WEB' },
      { kind: 'BOARD', itemId: 'b1', name: 'Roadmap', href: '/projects/AGX/boards/b1' },
      { kind: 'AGENT', itemId: 'a1', name: 'Writer', href: '/agents/writer' },
      { kind: 'PROJECT', itemId: 'p1', name: 'Client onboarding', href: '/projects/ONB' },
    ])
    expect(places[0]).toBe(SPACE_PLACE)
    expect(places.slice(1)).toEqual([
      { id: 'p2', placeId: 'p2', ref: { kind: 'project', key: 'WEB' }, name: 'Website relaunch', href: '/projects/WEB', basePath: '/projects/WEB' },
      { id: 'p1', placeId: 'p1', ref: { kind: 'project', key: 'ONB' }, name: 'Client onboarding', href: '/projects/ONB', basePath: '/projects/ONB' },
    ])
  })

  it('open a conversation from its place’s list', () => {
    expect(basePathOf({ kind: 'space' })).toBe('/chat')
    expect(basePathOf({ kind: 'project', id: 'p1', key: 'WEB', name: 'W' })).toBe('/projects/WEB')
    expect(placeIdOf({ kind: 'space' })).toBe('space')
    expect(placeIdOf({ kind: 'project', id: 'p1', key: 'WEB', name: 'W' })).toBe('p1')
  })
})
