/** The lead is told how to name a file or a task so the person can click it (spec part 3, *Chips in conversations*). */
import { describe, it, expect } from 'vitest'
import { leadBaseInstructions } from '../instructions'

const text = leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'the Shop project' })

describe("the lead's instructions on naming files and tasks @SC-1547", () => {
  it('names every reference form, from the place\'s root', () => {
    for (const form of ['files/<path>', 'files/<folder>', 'artefacts/<name>', 'workspaces/<id>/<path>', 'tasks/<task key>', 'tasks/<task key>/<path>', 'attachments/<task key>/<file name>']) {
      expect(text).toContain(form)
    }
  })

  it('says a relative path is not clickable, and how to put the root in front of a listing', () => {
    expect(text).toContain('A path relative to a folder')
    expect(text).toContain('e2e-files/app.ts found in\n  Files is files/e2e-files/app.ts')
  })

  it("says never to write an address or make up HQ's", () => {
    expect(text).toMatch(/Never write a web address or a link for a task or a file, and never make up HQ's address/)
  })
})

describe("the lead's instructions on its words @SC-1547", () => {
  it('speaks to the person as you, says an agent is assigned and not a member, and shows no id', () => {
    expect(text).toContain('Speak to the person as "you", never by their full name')
    expect(text).toContain('an agent is assigned to one, so say "assigned", not "member", of an agent')
    expect(text).toContain('Never put an id in an answer')
  })
})
