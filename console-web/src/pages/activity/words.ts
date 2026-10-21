/**
 * The record's words (board *Every action recorded against a person*). HQ keeps each action under a name for the
 * record (`site.added`) and its subject in words; a line says who did it and what, in words, with the subject under
 * it as HQ gave it. A name with no words here gets a plain line, never the name itself.
 */
import type { FleetActivityEntry } from '@agenthix/core'

const ACTIONS: Record<string, string> = {
  signedIn: 'signed in',
  signedOut: 'signed out',
  'site.addStarted': 'made a one-time code to add a site',
  'site.added': 'added a site',
  'site.addRefused': 'turned away a machine that asked to join',
  'site.registered': 'connected a site to HQ',
  'site.disconnected': 'disconnected a site',
  'fleetAdmin.granted': 'gave the fleet admin role',
  'fleetAdmin.removed': 'removed the fleet admin role',
  'console.moveStarted': 'made a one-time code to move the Fleet Console',
  'console.handedOver': 'moved the Fleet Console',
  'site.moveStarted': 'made a one-time code to move a site',
  'site.moveMachineJoined': 'confirmed the machine a site moves to',
  'site.moveScheduled': 'asked to move a site',
  'site.moved': 'moved a site',
  'site.moveFailed': 'moved a site, and it did not complete',
  'hq.moveStarted': 'made a one-time code to move HQ',
  'hq.moveMachineJoined': 'confirmed the machine HQ moves to',
  'hq.moveScheduled': 'asked to move HQ',
  'hq.moved': 'moved HQ',
  'hq.moveFailed': 'moved HQ, and it did not complete',
  'hq.machineMarked': 'marked the machine HQ runs on',
  'machine.notifySet': 'changed whether the fleet admins are told when a machine stops answering',
}

/** What a fleet admin asked of a machine, by the command's operation. */
const COMMANDS: Record<string, string> = {
  install: 'installed a site',
  start: 'started a site',
  stop: 'stopped a site',
  remove: 'removed a site',
  upgrade: 'upgraded',
  'backup.take': 'took a backup',
  'backup.export': 'exported a backup',
  'backup.store': 'stored a backup',
  'backup.fetch': 'fetched a backup',
  'backup.restore': 'restored from a backup',
  'capacity.set': 'changed the capacity',
  'address.set': "changed HQ's address",
  'frontDoor.set': 'changed the front door',
  schedule: 'scheduled maintenance',
  'schedule.change': 'changed the time of scheduled maintenance',
  'schedule.cancel': 'cancelled scheduled maintenance',
  suspend: 'suspended a site',
  resume: 'resumed a site',
  erase: 'erased a site',
  move: 'moved a site',
}

const wordsFor = (table: Record<string, string>, key: string) => (Object.hasOwn(table, key) ? table[key] : null)

export function activityLine(action: string): string {
  if (action.startsWith('command.')) return wordsFor(COMMANDS, action.slice('command.'.length)) ?? 'sent a command'
  return wordsFor(ACTIONS, action) ?? 'did something'
}

/**
 * Who did it. No account is a machine admin at the command line; HQ does not say which machine, so neither does
 * the line.
 */
export function whoDid(by: FleetActivityEntry['by']): { name: string; commandLine: boolean } {
  return by ? { name: by.name, commandLine: false } : { name: 'A machine admin', commandLine: true }
}
