/**
 * The turn the waiting cards become (conversation layer spec, A completion while a reply streams; Authorised
 * automatic continuation): one report for several completions; a continuation in its place when an obligation's
 * checks pass, refused when they fail or the depth is reached; never both for one card; one person per turn.
 */
import { describe, it, expect, vi } from 'vitest'
import { CONTINUATION_MAX_DEPTH, type ContinuationObligation } from '../../../shared/conversations/protocol'
import { planCardTurn, type AwaitingCard, type ContinuationCheck } from '../cardTurn'

function card(seq: number, extra: Partial<AwaitingCard> = {}): AwaitingCard {
  return {
    id: `c${seq}`, seq, kind: 'RESULT', operationId: `op${seq}`, operationState: 'COMPLETED', continuation: null,
    createdAt: new Date(seq * 1_000), ...extra,
  }
}

const then = (by: string, nextStep = 'fix it', depth = 1): ContinuationObligation => ({ authorisedById: by, authorisingTurnId: 't0', nextStep, depth })
const passes: ContinuationCheck = async () => true
const fails: ContinuationCheck = async () => false

describe('planCardTurn @SC-962 @SC-963', () => {
  it('makes one report turn of several completions and an approval request, acting for no one', async () => {
    const plan = await planCardTurn([card(3), card(1), card(2, { kind: 'APPROVAL_REQUEST', operationState: 'RUNNING' })], passes)
    expect(plan).toEqual({ trigger: 'REPORT', actingUserId: null, cardIds: ['c1', 'c2', 'c3'], continuations: [] })
  })

  it('has nothing to plan without cards', async () => {
    expect(await planCardTurn([], passes)).toBeNull()
  })

  it('continues in place of the report when the obligation still passes, as the person who authorised it', async () => {
    const check = vi.fn(passes)
    const plan = await planCardTurn([card(1), card(2, { continuation: then('u1', 'open a task', 2) })], check)
    expect(plan).toEqual({
      trigger: 'CONTINUATION', actingUserId: 'u1', continuationDepth: 2, cardIds: ['c1', 'c2'],
      continuations: [{ operationId: 'op2', nextStep: 'open a task' }],
    })
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('reports instead when a check fails', async () => {
    const plan = await planCardTurn([card(1, { continuation: then('u1') })], fails)
    expect(plan).toMatchObject({ trigger: 'REPORT', actingUserId: null, cardIds: ['c1'], continuations: [] })
  })

  it('reports instead when the depth is reached, without checking', async () => {
    const check = vi.fn(passes)
    const plan = await planCardTurn([card(1, { continuation: then('u1', 'x', CONTINUATION_MAX_DEPTH + 1) })], check)
    expect(plan?.trigger).toBe('REPORT')
    expect(check).not.toHaveBeenCalled()
  })

  it('never continues after work that failed or was stopped', async () => {
    const plan = await planCardTurn([
      card(1, { operationState: 'FAILED', continuation: then('u1') }),
      card(2, { operationState: 'CANCELLED', continuation: then('u1') }),
    ], passes)
    expect(plan?.trigger).toBe('REPORT')
  })

  it('leaves another person\'s continuation for a turn of its own', async () => {
    const plan = await planCardTurn([card(1, { continuation: then('u1') }), card(2, { continuation: then('u2') }), card(3)], passes)
    expect(plan).toMatchObject({ trigger: 'CONTINUATION', actingUserId: 'u1', cardIds: ['c1', 'c3'] })
  })

  it('carries every passing obligation of the same person, at the deepest depth', async () => {
    const plan = await planCardTurn([card(1, { continuation: then('u1', 'a', 1) }), card(2, { continuation: then('u1', 'b', 3) })], passes)
    expect(plan).toMatchObject({ continuationDepth: 3, continuations: [{ operationId: 'op1', nextStep: 'a' }, { operationId: 'op2', nextStep: 'b' }] })
  })
})
