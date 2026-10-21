import { describe, expect, it } from 'vitest'
import { cardTurnBlock, leadBaseInstructions } from '../instructions'

const text = leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space' })

describe("the lead's instructions on its background work @SC-968", () => {
  it('make the work its own, spoken of in the first person', () => {
    expect(text).toMatch(/Work you do in the background is you/)
    expect(text).toMatch(/"I'm working on…", "I've finished…", "I need your okay to…"/)
  })

  it('name the words that split it in two, and make a place where, not who', () => {
    expect(text).toMatch(/Never say you passed it to anyone or handed it off/)
    expect(text).toMatch(/a worker, a helper, the job or the run/)
    expect(text).toMatch(/A place is where you work, not who/)
  })

  it('give a short example for each moment', () => {
    expect(text).toContain('Starting: "I\'m listing your space and Walkthrough now — I\'ll tell you what\'s in them."')
    expect(text).toContain('Needing an okay: nothing to say; the request shows in the conversation, and the person answers it there.')
    expect(text).toContain('Finished: "I\'ve been through your space: it\'s empty."')
    expect(text).toMatch(/Failed: "I couldn't finish that: I have no model I'm allowed to use in Walkthrough/)
  })

  it('have it say what it started, in one short first-person line in the same step as the call', () => {
    expect(text).toMatch(/When you start work, say in one short line, in the first person, what you are doing/)
    expect(text).toMatch(/in the same step as the\s+call/)
    expect(text).not.toMatch(/don't announce it/)
    expect(text).toMatch(/When a part can't be\s+started, tell the person in this reply, and why/)
  })

  it('have it describe work as started only with the call that starts it (walkthrough finding 38)', () => {
    expect(text).toMatch(/Say work is starting only in the step that makes the call that starts it: words alone\s+start nothing\./)
  })

  it('no longer invite the split elsewhere', () => {
    expect(text).not.toMatch(/brief it as work|the worker starts|comes back to the conversation/)
  })
})

describe('the turn block when its work ends @SC-962', () => {
  const block = cardTurnBlock({ continuations: [], capped: true })

  it('tells it its own work finished, said in the first person', () => {
    expect(block).toMatch(/Your work in the background has finished \(above\)/)
    expect(block).toMatch(/in the first person/)
  })

  it('no longer has it present a request for the okay: a request takes no turn', () => {
    expect(block).not.toMatch(/Needing their okay|needs the person's okay|ask whether you may/)
  })

  it('names another agent whose work it is', () => {
    expect(block).toMatch(/Work another agent did on a task is theirs: name them/)
  })

  it('never speaks of work that came back or of who asks', () => {
    expect(block).not.toMatch(/came back|who asks|brief the work/)
    expect(block).toMatch(/offer to carry on with the rest in the background/)
  })
})
