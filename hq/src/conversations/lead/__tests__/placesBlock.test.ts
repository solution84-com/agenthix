/**
 * What the lead is told of its places every turn (agent knowledge spec, part 4, P6): the places by the names the
 * person sees, the organisation and the guide always in reach, and anything else out of reach until it is added.
 */
import { describe, expect, it } from 'vitest'
import { placesTurnBlock } from '../placesBlock'
import type { PlaceSummary } from '../../placesProtocol'

const shop: PlaceSummary = { kind: 'project', projectId: 'p-shop', name: 'My Org Project', level: 'my-org-project' }
const yours: PlaceSummary = { kind: 'user', name: 'Your space', level: 'personal' }
const notes: PlaceSummary = { kind: 'project', projectId: 'p-notes', name: 'Reading notes', level: 'reading-notes' }

const lines = (text: string) => text.split('\n')

describe("the turn's places block (P6) @SC-1438", () => {
  it("in a project's conversation, names the project as the person sees it, and its pages' level", () => {
    const text = placesTurnBlock({ own: shop, added: [] })
    expect(lines(text).slice(0, 2)).toEqual([
      "[This conversation's places, checked this turn]",
      "- My Org Project (its pages are named my-org-project:): the conversation's own",
    ])
    expect(text).toContain("The organisation's knowledge (org:) and the platform guide (platform:) are always in reach.")
    expect(text).not.toContain('Your space')
  })

  it("in the person's own space, calls it Your space, and another personal project by its own name", () => {
    expect(placesTurnBlock({ own: yours, added: [] })).toContain("- Your space (its pages are named personal:): the conversation's own")
    expect(placesTurnBlock({ own: notes, added: [] })).toContain("- Reading notes (its pages are named reading-notes:): the conversation's own")
  })

  it('names a place the person added, after its own', () => {
    const text = placesTurnBlock({ own: shop, added: [yours] })
    expect(lines(text).slice(1, 3)).toEqual([
      "- My Org Project (its pages are named my-org-project:): the conversation's own",
      '- Your space (its pages are named personal:): added by the person',
    ])
  })

  it('no longer names a place the person lost: the re-checked list is all it names', () => {
    const before = placesTurnBlock({ own: yours, added: [shop] })
    const after = placesTurnBlock({ own: yours, added: [] })
    expect(before).toContain('My Org Project')
    expect(after).not.toContain('My Org Project')
    expect(after).not.toContain('my-org-project')
  })

  it('says any other place is out of reach until added, offered with suggest_place, never answered as empty', () => {
    const text = placesTurnBlock({ own: yours, added: [] })
    expect(text).toMatch(/Any other place, a project or the person's space, is out of reach until the person adds it/)
    expect(text).toMatch(/finding nothing in it does not mean it is empty/)
    expect(text).toMatch(/offer it with suggest_place; never answer as if it were empty, and never use one of these places instead\./)
  })

  it('says when the conversation has no place left', () => {
    expect(placesTurnBlock({ own: null, added: [] })).toContain('- none: its project is gone')
  })
})
