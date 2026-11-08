import { describe, it, expect, vi } from 'vitest'
import type { SiteFileRef } from '@agenthix/core'
import { taskEmbed } from '../taskEmbed'
import { taskEmbedOpeners, taskFileAddress } from '../taskEmbedOpen'

const taskLoc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: 't1' }
const placeRef = (loc: Record<string, unknown>, path: string): SiteFileRef =>
  ({ space: 'place', loc: { ...taskLoc, ...loc }, path } as SiteFileRef)

function setup() {
  const openBeside = vi.fn()
  const go = vi.fn()
  return { openBeside, go, ...taskEmbedOpeners({ taskId: 't1', taskKey: 'WEB-4', openBeside, go }) }
}

describe('what a click on an embedded file in a task text opens @SC-1557', () => {
  it("opens the task's own working file beside the task", () => {
    const o = setup()
    o.onOpen(placeRef({}, 'notes/a.md'))
    expect(o.openBeside).toHaveBeenCalledWith({ kind: 'working', path: 'notes/a.md' })
    expect(o.go).not.toHaveBeenCalled()
  })

  it("opens the task's own attachment beside the task, and another task's file on its page", () => {
    const o = setup()
    o.onOpenTaskFile({ taskId: 't1', taskKey: 'WEB-4', loc: null, file: { kind: 'attachment', id: 'a1' } })
    expect(o.openBeside).toHaveBeenCalledWith({ kind: 'attachment', id: 'a1' })
    o.onOpenTaskFile({ taskId: 't9', taskKey: 'WEB-9', loc: null, file: { kind: 'attachment', id: 'a2' } })
    expect(o.go).toHaveBeenCalledWith('/tasks/WEB-9?attachment=a2')
    expect(o.openBeside).toHaveBeenCalledTimes(1)
  })

  it("opens a file of the place's files/ in the project's Files tool", () => {
    const o = setup()
    o.onOpen(placeRef({ taskId: null }, 'reports/q3.pdf'))
    expect(o.go).toHaveBeenCalledWith('/projects/WEB?tool=files&file=reports%2Fq3.pdf')
    expect(o.openBeside).not.toHaveBeenCalled()
  })

  it("opens an artefact in the place's Artefacts tool", () => {
    const o = setup()
    o.onOpen({ space: 'artefact', owner: { ownerType: 'project', ownerId: 'p1' }, name: 'brief v2.md' } as SiteFileRef)
    expect(o.go).toHaveBeenCalledWith('/projects/WEB?tool=artefacts&artefact=brief%20v2.md')
  })

  it("opens a file of Your space in the person's Files tool", () => {
    const o = setup()
    o.onOpen(placeRef({ ownerType: 'user', ownerId: 'u1', taskId: null }, 'a.md'))
    expect(o.go).toHaveBeenCalledWith('/chat?tool=files&file=a.md')
  })

  it("opens a workspace's file in that workspace", () => {
    const o = setup()
    o.onOpen(placeRef({ workspaceId: 'w1', taskId: null }, 'x.txt'))
    expect(o.go).toHaveBeenCalledWith('/projects/WEB?tool=workspaces&workspace=w1')
  })

  it('addresses a task file on the task page', () => {
    expect(taskFileAddress('WEB-4', { kind: 'working', path: 'a b.md' })).toBe('/tasks/WEB-4?file=a+b.md')
  })
})

describe('taskEmbed carries the openers @SC-1557', () => {
  it('has them in its context, and none without', () => {
    const o = setup()
    expect(taskEmbed('p1', 't1', { key: 'WEB-4', openers: { onOpen: o.onOpen, onOpenTaskFile: o.onOpenTaskFile } })?.onOpen).toBe(o.onOpen)
    expect(taskEmbed('p1', 't1', { key: 'WEB-4' })?.onOpen).toBeUndefined()
  })

  it("resolves a Your-space task's files/ against its person, given the project's facts", () => {
    const e = taskEmbed('p1', 't1', { key: 'ME-1', personalSpace: true, personalOwnerId: 'u1' })
    expect(e?.place).toMatchObject({ siblings: { ownerType: 'user', ownerId: 'u1' } })
  })
})
