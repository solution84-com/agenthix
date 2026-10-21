import { describe, expect, it } from 'vitest'
import { activityLine, whoDid } from '../pages/activity/words'
import { kindOf } from '../pages/activity/filters'


describe('a line of the record @SC-917', () => {
  it('says what was done in words, never the name the record keeps', () => {
    expect(activityLine('site.added')).toBe('added a site')
    expect(activityLine('fleetAdmin.granted')).toBe('gave the fleet admin role')
    expect(activityLine('command.backup.export')).toBe('exported a backup')
    expect(activityLine('command.erase')).toBe('erased a site')
    expect(activityLine('signedIn')).toBe('signed in')
  })

  it('says something plain for an action it has no words for', () => {
    expect(activityLine('command.somethingNew')).toBe('sent a command')
    expect(activityLine('somethingNew')).toBe('did something')
    expect(activityLine('constructor')).toBe('did something')
  })

  it('names the person, or a machine admin at the command line when no account did it', () => {
    expect(whoDid({ id: 'u', name: 'Sam Rivera' })).toEqual({ name: 'Sam Rivera', commandLine: false })
    expect(whoDid(null)).toEqual({ name: 'A machine admin', commandLine: true })
  })

  it('words a change of the notify setting', () => {
    expect(activityLine('machine.notifySet')).toBe('changed whether the fleet admins are told when a machine stops answering')
  })
})

describe('the kind of a line, to find by @SC-917', () => {
  it('groups the record’s names into the kinds a person looks for', () => {
    expect(kindOf('signedIn')).toBe('signIns')
    expect(kindOf('site.added')).toBe('sites')
    expect(kindOf('site.disconnected')).toBe('sites')
    expect(kindOf('site.moveScheduled')).toBe('moves')
    expect(kindOf('hq.moved')).toBe('moves')
    expect(kindOf('console.handedOver')).toBe('moves')
    expect(kindOf('command.backup.export')).toBe('backups')
    expect(kindOf('command.upgrade')).toBe('maintenance')
    expect(kindOf('fleetAdmin.granted')).toBe('roles')
    expect(kindOf('somethingNew')).toBe('other')
  })
})
