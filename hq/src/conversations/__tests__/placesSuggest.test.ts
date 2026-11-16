/**
 * suggest_place (agent knowledge spec, part 4, P5 and B6): the lead's only way to ask for a place. It never adds
 * one; it leaves a card only the person answers, and a place the person can't open is refused in fixed words.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import type { ActionBody } from '../../shared/conversations/protocol'
import { turnCapability } from '../../server/controlplane/__tests__/turnFixtures'
import { conversationTools } from '../work/registry'
import { SUGGEST_UNREACHABLE, createSuggestPlaceTool, namesOwnSpace, type SuggestPlaceDeps } from '../placesSuggest'
import { placeSuggestionOf } from '../placesProtocol'
import type { Place } from '../places'

const signal = new AbortController().signal
const shop: Place = { type: 'project', id: 'p-shop' }

function setup(held: Place[] = [{ type: 'user', id: 'u1' }], found: Place | null = shop) {
  const cards: ActionBody[] = []
  const deps: SuggestPlaceDeps = {
    conversation: vi.fn(async () => ({ personId: 'u1', held })),
    find: vi.fn(async () => found),
    name: vi.fn(async (p: Place) => (p.type === 'user' ? { name: 'Your space', level: 'personal' } : { name: 'Shop', level: 'shop' })),
    card: vi.fn(async (_c, body: ActionBody) => { cards.push(body) }),
  }
  return { tool: createSuggestPlaceTool(deps), deps, cards }
}

const ask = (tool: ReturnType<typeof setup>['tool'], over = {}, args: unknown = { place: 'shop', why: 'The release notes are there.' }) =>
  tool.run(turnCapability(over), args, { signal })

describe('suggest_place is offered @SC-1439', () => {
  it("as one of the lead's own tools", () => {
    expect(conversationTools().filter(t => t.name === 'suggest_place')).toHaveLength(1)
  })

  it('to a turn that answers a person, and never to a report, a turn for no one, a task\'s thread or an expired turn', async () => {
    const { tool } = setup()
    expect(await tool.offered(turnCapability())).toBe(true)
    expect(await tool.offered(turnCapability({ trigger: 'REPORT' }))).toBe(false)
    expect(await tool.offered(turnCapability({ actingUserId: null, readerUserId: 'u1' }))).toBe(false)
    expect(await tool.offered(turnCapability({ home: 'TASK', taskId: 't1', projectId: 'p1' }))).toBe(false)
    expect(await tool.offered(turnCapability({ expiresAt: Date.now() - 1 }))).toBe(false)
    expect(await tool.offered(turnCapability({ permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['suggest_place'] } }))).toBe(false)
  })
})

describe('suggest_place @SC-1439', () => {
  it('leaves a card naming the place and why, and adds nothing', async () => {
    const { tool, cards } = setup()
    const outcome = await ask(tool)
    expect(outcome.status).toBe('done')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.text).toBe('Add a place to this conversation: Shop')
    expect(placeSuggestionOf(cards[0]!)).toEqual({
      kind: 'suggest_place', place: { kind: 'project', projectId: 'p-shop', name: 'Shop', level: 'shop' }, why: 'The release notes are there.',
    })
  })

  it('can ask for the person\'s own space from a project\'s conversation', async () => {
    const { tool, cards } = setup([{ type: 'project', id: 'p-web' }], { type: 'user', id: 'u1' })
    await ask(tool, { home: 'PROJECT', projectId: 'p-web' }, { place: 'personal', why: 'Your notes are there.' })
    expect(placeSuggestionOf(cards[0]!)?.place).toEqual({ kind: 'user', name: 'Your space', level: 'personal' })
  })

  it('reads the own space by its level and by what the person or the agent calls it', () => {
    for (const words of ['personal', 'personal:', 'Your space', 'my space', ' My space ']) expect(namesOwnSpace(words)).toBe(true)
    for (const words of ['shop', 'space', 'their space']) expect(namesOwnSpace(words)).toBe(false)
  })

  it("refuses a place the person can't open, in fixed words that echo nothing asked", async () => {
    const { tool, cards } = setup(undefined, null)
    const outcome = await ask(tool, {}, { place: 'secret-merger', why: 'x' })
    expect(outcome).toEqual({ status: 'refused', reason: SUGGEST_UNREACHABLE })
    expect(SUGGEST_UNREACHABLE).not.toContain('secret-merger')
    expect(cards).toHaveLength(0)
  })

  it('refuses a place the conversation already holds', async () => {
    const { tool, cards } = setup([{ type: 'user', id: 'u1' }, shop])
    const outcome = await ask(tool)
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringContaining('Shop is already in this conversation') })
    expect(cards).toHaveLength(0)
  })

  it("suggests nothing for a turn acting for someone who isn't the conversation's person", async () => {
    const { tool, deps, cards } = setup()
    expect(await ask(tool, { actingUserId: 'u2' })).toEqual({ status: 'refused', reason: SUGGEST_UNREACHABLE })
    expect(deps.find).not.toHaveBeenCalled()
    expect(cards).toHaveLength(0)
  })

  it('refuses arguments that do not fit, and a turn it is not offered to', async () => {
    const { tool } = setup()
    expect(await ask(tool, {}, { place: '', why: 'x' })).toMatchObject({ status: 'refused' })
    expect(await ask(tool, { trigger: 'REPORT' })).toMatchObject({ status: 'refused' })
  })
})

describe('the card as a screen reads it @SC-1439 @SC-1440', () => {
  it('is only an ACTION of suggest_place with a place target', () => {
    expect(placeSuggestionOf({ text: 'Remembered x', toolName: 'remember' })).toBeNull()
    expect(placeSuggestionOf({ text: 'x', toolName: 'suggest_place', target: { kind: 'task', id: 'T-1', label: 'x' } })).toBeNull()
  })
})
