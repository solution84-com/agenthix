import { describe, expect, it } from 'vitest'
import { activityNotice } from '../activityWords'

describe('the notification for what a fleet admin did @SC-922', () => {
  it('reads as a sentence, and names a site and its machine by the one name', () => {
    expect(activityNotice('dana', 'site.added', 'machine-b (2111 3B95 F2C6 A21E)'))
      .toEqual({ title: 'dana added the site machine-b', body: 'machine-b (2111 3B95 F2C6 A21E)' })
    expect(activityNotice('dana', 'site.added', 'new-server (AAAA), to restore office-server from its backup of 2026-10-14T02:00:00Z').title)
      .toBe('dana added the site new-server')
  })

  it('words a site disconnected, and a move\'s new machine confirmed', () => {
    expect(activityNotice('dana', 'site.disconnected', 'machine-b (2111 3B95 F2C6 A21E)').title).toBe('dana disconnected machine-b')
    expect(activityNotice('dana', 'site.moveMachineJoined', 'machine-b joined to receive machine-a (2111 3B95)').title)
      .toBe('dana confirmed machine-b to receive machine-a')
    expect(activityNotice('dana', 'hq.moveMachineJoined', 'machine-c joined to receive HQ (AAAA)').title).toBe('dana confirmed machine-c to receive HQ')
  })

  it('words a move asked for, finished and failed', () => {
    expect(activityNotice('dana', 'site.moveScheduled', 'machine-b to machine-c, now').title).toBe('dana is moving machine-b to machine-c')
    expect(activityNotice('dana', 'site.moveScheduled', 'machine-b to machine-c, at 2026-10-16T18:00:00Z').title)
      .toBe('dana scheduled moving machine-b to machine-c')
    expect(activityNotice('dana', 'site.moved', 'machine-b now runs on machine-c, and is named machine-c; the machine it ran on left the fleet'))
      .toEqual({ title: 'machine-b moved to machine-c', body: 'machine-b now runs on machine-c, and is named machine-c; the machine it ran on left the fleet' })
    expect(activityNotice('dana', 'site.moved', 'machine-b now runs on a new machine of the same name; the machine it ran on left the fleet').title)
      .toBe('machine-b moved to a new machine of the same name')
    expect(activityNotice('dana', 'site.moveFailed', 'machine-b: the site did not answer')).toEqual({ title: 'Moving machine-b did not complete', body: 'the site did not answer' })
    expect(activityNotice('dana', 'hq.moved', 'HQ now runs on machine-d, and its site is named machine-d').title).toBe('HQ moved to machine-d')
  })

  it('words a site restored onto a new machine, and what it replaced and lost (adr-0119)', () => {
    expect(activityNotice('A machine admin', 'site.restored', 'office-server now runs on new-server, and is named new-server')).toEqual({
      title: 'office-server was restored on new-server from a backup',
      body: 'It is named new-server now. It takes the place of the machine it ran on, which HQ refuses if it comes back. Anything office-server did after its backup was taken is lost.',
    })
    expect(activityNotice('A machine admin', 'site.restored', 'office-server now runs on a new machine of the same name').body)
      .toBe('It takes the place of the machine it ran on, which HQ refuses if it comes back. Anything office-server did after its backup was taken is lost.')
  })

  const DEFAULT = /changed something in the fleet/
  const RECORDED = [
    ['signedIn', 'On m, at the machine'], ['signedOut', 'On m'],
    ['site.addStarted', 'A one-time code to add a site'], ['site.addRefused', 'm (AAAA)'], ['site.registered', 'm'],
    ['site.moveStarted', 'A one-time code to move office to a new machine'], ['hq.moveStarted', 'A one-time code to move HQ to a new machine'],
    ['console.moveStarted', 'A one-time code to move the Fleet Console from m, made on that machine'],
    ['console.handedOver', 'The Fleet Console on a handed its machines to the one on b (AAAA)'],
    ['fleetAdmin.granted', 'Sam Rivera'], ['fleetAdmin.removed', 'Sam Rivera'],
    ...['install', 'start', 'stop', 'remove', 'upgrade', 'backup.take', 'backup.export', 'backup.store', 'backup.fetch', 'backup.restore',
      'capacity.set', 'address.set', 'frontDoor.set', 'schedule', 'schedule.change', 'schedule.cancel', 'suspend', 'resume', 'erase', 'move']
      .map(op => [`command.${op}`, 'office']),
  ]

  it('gives every action the Fleet Console or the command line records its own plain title', () => {
    for (const [action, subject] of RECORDED) {
      const n = activityNotice('dana', action, subject)
      expect(n.title, action).not.toMatch(DEFAULT)
      expect(n.title, action).toMatch(/^dana |^[A-Z]/)
      expect(JSON.stringify(n), action).not.toMatch(/\b(site|hq|command|console|fleetAdmin)\.[a-z]/i)
    }
  })

  it('names the site of a restore by the name it had', () => {
    expect(activityNotice('dana', 'command.backup.restore', 'office now runs on new-server, and is named new-server').title).toBe('dana restored office from a backup')
  })

  it('words what was done on the command line as a machine admin, never as the machine', () => {
    expect(activityNotice('A machine admin', 'command.suspend', 'office').title).toBe('A machine admin suspended office')
    expect(activityNotice('dana', 'command.capacity.set', 'office').title).toBe('dana changed how much office may run at once')
    expect(activityNotice('dana', 'command.address.set', 'office').title).toBe("dana changed the address on office's machine")
    expect(activityNotice('dana', 'command.frontDoor.set', 'office').title).toBe("dana changed the front door on office's machine")
    expect(activityNotice('dana', 'fleetAdmin.granted', 'Sam Rivera').title).toBe('dana made Sam Rivera a fleet admin')
    expect(activityNotice('dana', 'fleetAdmin.removed', 'Sam Rivera').title).toBe('dana removed Sam Rivera as a fleet admin')
    expect(activityNotice('dana', 'console.handedOver', 'x').title).toBe('dana moved the Fleet Console to another machine')
    expect(activityNotice('dana', 'site.addStarted', 'x').title).toBe('dana made a one-time code to add a site')
  })

  it('calls planned maintenance maintenance, with what it is, never a change', () => {
    expect(activityNotice('dana', 'command.schedule', 'office-server: upgrade to 0.3.0, at 2026-10-18T02:00:00.000Z')).toEqual({
      title: 'dana planned maintenance on office-server: upgrade to 0.3.0',
      body: 'office-server: upgrade to 0.3.0, at 2026-10-18T02:00:00.000Z',
    })
    expect(activityNotice('dana', 'command.schedule', 'office').title).toBe('dana planned maintenance on office')
    expect(activityNotice('dana', 'command.schedule.change', 'office').title).toBe('dana changed the time of scheduled maintenance on office')
    expect(activityNotice('dana', 'command.schedule.cancel', 'office').title).toBe('dana cancelled scheduled maintenance on office')
    for (const op of ['schedule', 'schedule.change', 'schedule.cancel']) {
      expect(activityNotice('dana', `command.${op}`, 'office').title).not.toMatch(/\ba change\b|scheduled change/)
    }
  })

  it('words a change of whether the fleet admins are told when a machine stops answering', () => {
    expect(activityNotice('dana', 'machine.notifySet', 'office: do not notify the fleet admins if it stops answering').title)
      .toBe('dana changed whether the fleet admins are told when a machine stops answering')
  })

  it('words connecting HQ to Agenthix Cloud and disconnecting it, with the organisation it was connected as @SC-1099', () => {
    expect(activityNotice('dana', 'cloud.connected', 'Acme Robotics')).toEqual({ title: 'dana connected HQ to Agenthix Cloud', body: 'Connected as Acme Robotics' })
    expect(activityNotice('dana', 'cloud.disconnected', 'Acme Robotics')).toEqual({ title: 'dana disconnected HQ from Agenthix Cloud', body: 'It was connected as Acme Robotics.' })
  })

  it('never shows the action name, even for one with no sentence', () => {
    const n = activityNotice('dana', 'site.somethingNew', 'x')
    expect(n.title).toBe('dana changed something in the fleet')
    expect(JSON.stringify(n)).not.toContain('somethingNew')
    for (const a of ['site.added', 'site.disconnected', 'site.moveMachineJoined', 'hq.moveMachineJoined', 'site.moveScheduled', 'site.moved', 'site.moveFailed', 'hq.machineMarked', 'command.erase', 'command.backup.export', 'site.restored']) {
      expect(activityNotice('dana', a, 'odd subject').title).not.toMatch(/site\.|hq\.|command\./)
    }
  })
})
