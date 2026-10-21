/**
 * The notification a person reads for something a fleet admin did, from the action's name and subject as the Fleet
 * Console records them. The action's name is for the record, never for people: one with no sentence here gets a
 * plain one. Pure, so each wording is tested.
 *
 * A site and its machine are one thing, called by the machine's name, so a subject names one of them ("office-server
 * (2111 3B95)"); a move or restore says the name the site takes ("office-server now runs on lab-02, and is named
 * lab-02").
 */
export type ActivityNotice = { title: string; body: string }

const MOVE_ASKED = /^(.+?) to (.+?)(?:, now|, at .+)$/
const MOVED = /^(.+?) now runs on (.+?)(?:, and (?:its site )?is named .+?)?(?:;.*)?$/
const FAILED = /^(.+?): (.+)$/
const RESTORED = /^(.+?) now runs on (.+?)(?:, and is named (.+))?$/
/** What maintenance a `schedule` was, as the Fleet Console records it: "office-server: upgrade to 0.3.0, at …". */
const PLANNED = /^.+?: (.+?), at .+$/
const JOINED_TO_RECEIVE = /^(.+?) joined to receive (.+?)(?: \((.+)\))?$/
/** Where the name at the start of a subject ends: its fingerprint, what follows it, or what became of it. */
const NAME_ENDS = / \(|, |: | now runs on /

function siteNamed(subject: string): string {
  return subject.split(NAME_ENDS)[0]
}

export function activityNotice(who: string, action: string, subject: string): ActivityNotice {
  const body = subject
  switch (action) {
    case 'site.added': return { title: `${who} added the site ${siteNamed(subject)}`, body }
    case 'site.disconnected': return { title: `${who} disconnected ${siteNamed(subject)}`, body }
    case 'site.moveMachineJoined':
    case 'hq.moveMachineJoined': {
      const m = JOINED_TO_RECEIVE.exec(subject)
      return m ? { title: `${who} confirmed ${m[1]} to receive ${m[2]}`, body } : { title: `${who} confirmed a machine for a move`, body }
    }
    case 'cloud.connected': return { title: `${who} connected HQ to Agenthix Cloud`, body: `Connected as ${subject}` }
    case 'cloud.disconnected': return { title: `${who} disconnected HQ from Agenthix Cloud`, body: `It was connected as ${subject}.` }
    case 'remoteAccess.on': return { title: 'Agenthix Cloud turned on remote access to the Fleet Console', body }
    case 'remoteAccess.off': return { title: 'Remote access to the Fleet Console was turned off', body }
    case 'remoteAccess.ended': return { title: 'Remote access to the Fleet Console ended at its set time', body }
    case 'remoteAccess.authenticatorClaimed': return { title: `${who} set up their authenticator for remote access to the Fleet Console`, body }
    case 'hq.machineMarked': return { title: `${who} marked the machine HQ runs on`, body }
    case 'site.moveScheduled':
    case 'hq.moveScheduled': {
      const m = MOVE_ASKED.exec(subject)
      const later = !subject.endsWith(', now')
      return { title: m ? `${who} ${later ? 'scheduled moving' : 'is moving'} ${m[1]} to ${m[2]}` : `${who} scheduled a move`, body }
    }
    case 'site.moved':
    case 'hq.moved': {
      const m = MOVED.exec(subject)
      return { title: m ? `${m[1]} moved to ${m[2]}` : 'A move finished', body }
    }
    case 'site.moveFailed':
    case 'hq.moveFailed': {
      const m = FAILED.exec(subject)
      return m ? { title: `Moving ${m[1]} did not complete`, body: m[2] } : { title: 'A move did not complete', body }
    }
    case 'site.restored': {
      const m = RESTORED.exec(subject)
      if (!m) return { title: 'A site was restored from a backup', body }
      return {
        title: `${m[1]} was restored on ${m[2]} from a backup`,
        body: `${m[3] ? `It is named ${m[3]} now. ` : ''}It takes the place of the machine it ran on, which HQ refuses if it comes back. Anything ${m[1]} did after its backup was taken is lost.`,
      }
    }
    case 'signedIn': return { title: `${who} signed in to the Fleet Console`, body }
    case 'signedOut': return { title: `${who} signed out of the Fleet Console`, body }
    case 'site.addStarted': return { title: `${who} made a one-time code to add a site`, body }
    case 'site.addRefused': return { title: `${who} turned away a machine that asked to join`, body }
    case 'site.registered': return { title: `${who} connected the site ${siteNamed(subject)} to HQ`, body }
    case 'site.moveStarted': return { title: `${who} made a one-time code to move a site`, body }
    case 'hq.moveStarted': return { title: `${who} made a one-time code to move HQ`, body }
    case 'console.moveStarted': return { title: `${who} made a one-time code to move the Fleet Console`, body }
    case 'console.handedOver': return { title: `${who} moved the Fleet Console to another machine`, body }
    case 'machine.notifySet': return { title: `${who} changed whether the fleet admins are told when a machine stops answering`, body }
    case 'fleetAdmin.granted': return { title: `${who} made ${subject} a fleet admin`, body: '' }
    case 'fleetAdmin.removed': return { title: `${who} removed ${subject} as a fleet admin`, body: '' }
    default: break
  }
  if (action === 'command.schedule') {
    const what = PLANNED.exec(subject)?.[1]
    return { title: `${who} planned maintenance on ${siteNamed(subject)}${what ? `: ${what}` : ''}`, body }
  }
  if (action.startsWith('command.')) {
    const site = siteNamed(subject)
    const title = COMMAND_TITLES[action.slice('command.'.length)]
    if (title) return { title: title(who, site), body }
  }
  return { title: `${who} changed something in the fleet`, body }
}

/** What a command line or a fleet admin asked of a machine, by the command's operation; `site` is the site on it. */
const COMMAND_TITLES: Record<string, (who: string, site: string) => string> = {
  install: (who, site) => `${who} installed the site ${site}`,
  start: (who, site) => `${who} started ${site}`,
  stop: (who, site) => `${who} stopped ${site}`,
  remove: (who, site) => `${who} removed ${site} from its machine`,
  upgrade: (who, site) => `${who} upgraded ${site}`,
  'backup.take': (who, site) => `${who} took a backup of ${site}`,
  'backup.export': (who, site) => `${who} exported a backup of ${site}`,
  'backup.store': (who, site) => `${who} stored a backup of ${site} in its backup location`,
  'backup.fetch': (who, site) => `${who} fetched a backup of ${site} from its backup location`,
  'backup.restore': (who, site) => `${who} restored ${site} from a backup`,
  'capacity.set': (who, site) => `${who} changed how much ${site} may run at once`,
  'address.set': (who, site) => `${who} changed the address on ${site}'s machine`,
  'frontDoor.set': (who, site) => `${who} changed the front door on ${site}'s machine`,
  'schedule.change': (who, site) => `${who} changed the time of scheduled maintenance on ${site}`,
  'schedule.cancel': (who, site) => `${who} cancelled scheduled maintenance on ${site}`,
  suspend: (who, site) => `${who} suspended ${site}`,
  resume: (who, site) => `${who} resumed ${site}`,
  erase: (who, site) => `${who} erased ${site}`,
  move: (who, site) => `${who} moved ${site}`,
}
