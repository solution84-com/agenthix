/**
 * The CLI's commands (host-management spec §6, §9; the CLI board's *agenthix help*): what a person types, the
 * request it becomes, and its line in `help`. Only commands this version does are listed; each later one is a
 * row here.
 */
import { parseCapacity, type CapacityCommand } from './capacity'
import { parseSchedule, parseScheduleChange, type ScheduledCommand } from './scheduled'
import { parseUpgrade, parseUpgrades, type UpgradeCommand } from './upgrades'
import { LIFECYCLE_VERBS, parseLifecycle, type LifecycleCommand } from './lifecycle'
import { parseHqConsole, parseConsole, type ConsoleCommand } from './console'
import { parseHqAddress, type HqAddressCommand } from './hqAddress'
import { parseHqMove, type MoveCommand } from './move'
import { parseCloud, parseCloudConsole, type CloudCommand } from './cloud'
import { parseUninstall, type UninstallCommand } from './uninstall'
import { normalizeJoinCode } from '@agenthix/core'
import { addressProblem } from '../install/address'
import { product } from './words'

export type Command =
  | { kind: 'help'; topic?: string }
  | { kind: 'install'; address?: string; yes: boolean }
  | { kind: 'status' }
  | { kind: 'inviteAdmin'; yes: boolean }
  | { kind: 'resetPassword'; user: string }
  | { kind: 'logs'; target: 'hq' | 'site'; service?: string; lines: number }
  | { kind: 'frontDoor'; action: 'show' | 'on' | 'off'; takePorts: boolean; filesHost?: string }
  | { kind: 'backupNow' }
  | { kind: 'backupExport'; to?: string }
  | { kind: 'backupLocation'; path?: string }
  | { kind: 'restore'; from: string; address?: string; code?: string }
  | { kind: 'usage'; message: string }
  | Exclude<CapacityCommand, { kind: 'usage' }>
  | ScheduledCommand
  | UpgradeCommand
  | LifecycleCommand
  | ConsoleCommand
  | HqAddressCommand
  | MoveCommand
  | CloudCommand
  | UninstallCommand

export type HelpRow = { group: 'machine' | 'hq' | 'site' | 'console' | 'cloud'; usage: string; does: string; detail: string }

export const HELP: HelpRow[] = [
  { group: 'machine', usage: 'install', does: 'Install HQ and its site',
    detail: 'Asks one question, where people will open HQ, then starts HQ and its site on this machine and prints one link for the first account. Running it again starts what is stopped and changes nothing that is set. --address <address> answers the question; --yes takes the answer in brackets.' },
  { group: 'machine', usage: 'status', does: 'The HQ and the site here, and what to do next',
    detail: 'Every HQ and site on this machine, each in a sentence that ends in what to do next.' },
  { group: 'machine', usage: 'capacity [set …]', does: 'Show or set what each agent may use',
    detail: 'The ceilings for every agent container on this machine: memory, processors and processes per container, and how many containers run at once. capacity set changes them, with --memory <size>, --processors <n>, --processes <n> and --containers <n>; they must fit the machine. HQ and projects may narrow them for a run, never raise them. The agent protections have no setting: they are always on.' },
  { group: 'machine', usage: 'front-door [on | off]', does: 'Show or change the web front door',
    detail: "With nothing after it: whether the front door is on, and how to point this machine's own web server at HQ instead. " +
      'on: the host service serves HQ and its uploaded files over https itself, with certificates it gets and renews. It takes ports 80 and 443, ' +
      'and is refused while either is in use. It asks first; from a script, add --take-ports-80-and-443. --files <host> names the uploaded ' +
      "files' host, files.<HQ's host> by default. If a certificate cannot be had, everything is put back as it was. off: stops it and frees the ports." },
  { group: 'machine', usage: 'backup [export]', does: 'Take a sealed backup now, or export one',
    detail: 'Takes a sealed backup of everything the site here holds, HQ included on HQ\'s machine, as the nightly one does. With export, takes one and seals it to a key made for it alone, shown once: the file is useless without it. The file is written to the exports folder in the state folder, or to --to <folder> on this machine.' },
  { group: 'machine', usage: 'backup location [<path>]', does: 'Show or choose the folder for backup copies',
    detail: 'Without a path, where copies go. With one — a folder as this machine sees it: a network address, a NAS, a synced drive, a mounted bucket — tests that it can be written, shows the key the copies are sealed to once, and from then on writes each nightly backup there too. It is set only here, on the machine.' },
  { group: 'machine', usage: 'restore --from <folder or file> [<hq address> <code>]', does: 'On a new machine, bring back HQ and its site, or a lost site, from a backup',
    detail: 'On a machine where nothing runs yet, after a machine was lost: lists the backups in the folder (the backup location) or reads the export file, asks which night and its key, and checks the key. HQ\'s machine comes back, HQ and its site as they were that night; other sites reconnect by themselves. Another site comes back as itself with HQ\'s address and the code a fleet admin gets from Restore from a backup… in the Fleet Console: this machine connects with the code, the fleet admin confirms its fingerprint, and the site is restored here and takes the place of its lost machine, which HQ refuses from then on. The key is typed here and never leaves this machine.' },
  { group: 'machine', usage: 'scheduled', does: 'List the scheduled changes',
    detail: "The changes scheduled on this machine, soonest first: each one's number, its time in this machine's time zone, what it does and who scheduled it. HQ tells the people whose work each one affects from the moment it is scheduled; a few minutes before, it starts no new runs on what it affects, and runs going then pause and carry on afterwards. An upgrade, move or erase due while a backup runs — the nightly one is at 02:00 unless set otherwise — waits for it to finish, for up to 30 minutes, and says so." },
  { group: 'machine', usage: 'schedule cancel <id>', does: 'Cancel a scheduled change',
    detail: 'Cancels the scheduled change with that number in the list. HQ tells everyone it told of it. A change that is running cannot be cancelled.' },
  { group: 'machine', usage: 'schedule change <id> --at <time>', does: "Move a scheduled change to another time",
    detail: 'Moves the scheduled change with that number to a new time, in this machine\'s time zone: "Sun 18 Oct 04:00", "2026-10-18 04:00", "tomorrow 04:00" or "04:00". HQ tells everyone it told of it.' },
  { group: 'machine', usage: 'upgrades [auto on | off]', does: 'Show or change automatic fixes',
    detail: 'Whether fixes — new patch versions of what runs here — apply by themselves, and when. On by default: each is scheduled for the start of the maintenance window, Sunday 02:00–04:00 unless moved, and HQ tells the people it affects. Like every upgrade it takes a backup first and is rolled back if HQ or the site does not come up healthy. A new minor or major version never applies by itself, nor a fix that was rolled back. auto off turns them off and cancels any they scheduled; --window "<day> <from>-<to>" (a day, or daily) moves the window.' },
  { group: 'machine', usage: 'upgrades host [--launcher on | off]', does: 'Switch the host service to its newest version',
    detail: "Checks the host service's newest published image and fetches it, then, after asking, switches to it: a launcher in the host service's own image starts the new one with the same settings and state folder, and removes the old one once the new one answers. If it does not answer within 3 minutes, the old one is started again as it was. HQ and the site keep running throughout. A new version of HQ or the site moves the host service first in the same way. --yes answers for a script. --launcher off turns this off: the host service is then switched by hand, with the two commands this prints. --launcher on turns it back on." },
  { group: 'machine', usage: 'uninstall', does: `Take ${product} off this machine, leaving nothing behind`,
    detail: "Refused while HQ or a site is on this machine, running or suspended: erase it first, which keeps a final backup for 30 days. It lists exactly what goes and asks first; --yes answers for a script. Then it removes the Fleet Console, the agent containers, the agent protections' firewall table, the install's volumes, networks and the images it fetched (not one another container uses), the state folder with the backups in it, and the host service's own container last. Your backup location is never touched, nor the host service's image. An erased HQ or site still within its 30 days is purged only once its address or name is typed. A step that fails is said, and the rest still run; running it again removes what is left." },
  { group: 'machine', usage: 'help [<command>]', does: 'This list, or one command in detail', detail: 'This list, or one command in detail.' },
  { group: 'hq', usage: 'hq invite-admin', does: 'One link for the first account, or an admin invitation when none is left',
    detail: "On a fresh install, a link for the first account. Once HQ has people, an invitation to join as an organisation admin, marked in HQ as made on HQ's machine — for when no organisation admin can sign in. Every organisation admin is told." },
  { group: 'hq', usage: 'hq reset-password <user>', does: "A one-time link to set a person's password",
    detail: "A one-time link for that person to set a new password, valid for an hour. HQ does not send it: give it to them yourself. The other organisation admins are told." },
  { group: 'hq', usage: 'hq upgrade [<version>]', does: 'Upgrade now, after a backup',
    detail: "Upgrades HQ and its site to the newest published version, or to the one named. It starts in 5 minutes: HQ tells everyone at once, starts no new runs, and runs going pause after their current step; schedule cancel <id> calls it off before then. Every new image's signature is checked before anything stops; then HQ and its site stop, a sealed backup is taken, and the new version starts. If HQ does not answer as the new version, or its site does not connect, within 10 minutes, the host service goes back to the version before, from that backup, by itself; status says so afterwards. It asks first; --yes answers for a script. --at <time> schedules it for a later time instead. A version newer than the host service's own moves the host service to it first, through its launcher; with the launcher off, this says how to switch it by hand." },
  { group: 'hq', usage: 'hq logs [<part>]', does: 'Show recent logs',
    detail: "HQ's recent log lines: hq-server, hq-web and hq-db, or one of them. --lines <n> shows more or fewer (200 by default)." },
  { group: 'site', usage: 'site schedule <change> --at <time>', does: 'Schedule an upgrade, resize, suspend, resume or move of the site for later',
    detail: 'Schedules a change of the site for a time in this machine\'s time zone: site schedule upgrade [<version>] --at <time>, site schedule resize --at <time> with the settings capacity set takes (--memory, --processors, --processes, --containers), or site schedule suspend --at <time> and site schedule resume --at <time>. The time must be ahead. agenthix scheduled lists what is scheduled. On HQ\'s machine, hq schedule upgrade --at <time> schedules HQ\'s upgrade, its site with it. ' +
      "site schedule move --at <time> asks the Fleet Console for a one-time code, for 1 hour, that moves the site to a new machine: on that machine, which must run nothing yet, run console connect <hq address> <code>; once a fleet admin confirms it in the Fleet Console, the site moves at that time. It keeps its name, its credential and its workspaces; this machine stops it for the final backup, and removes its copy and leaves the fleet once the site answers from the new machine. If it does not, the site starts here again. " +
      "On HQ's machine, hq schedule move --at <time> [--address <new address>] does the same for HQ, its site and the Fleet Console beside them: HQ is read-only from the moment the backup starts, tells its sites and machines a new address first, and removes its copy here once it answers on the new machine; if it does not, HQ starts here again." },
  { group: 'site', usage: 'site upgrade [<version>]', does: 'Upgrade the site now, after a backup',
    detail: "As for HQ, for the site alone, in 5 minutes after notice to the people whose projects run there: the site stops, a sealed backup is taken, and the new version starts; if it does not connect to HQ, it goes back to the version before, from that backup. On HQ's machine the site goes no further than HQ. --at <time> schedules it for a later time instead; --yes answers for a script." },
  { group: 'hq', usage: 'hq suspend | resume', does: 'Stop it and keep everything; start it again',
    detail: "suspend stops HQ and its site and keeps everything: the data, the backups and the credentials. HQ tells everyone first, as for any scheduled change; runs pause, and nothing new starts until it is resumed. resume starts both again. --at <time> does either later, in this machine's time zone." },
  { group: 'hq', usage: 'hq erase [--on <date>]', does: 'Erase at once, or on a date with notice; kept 30 days, then purged',
    detail: "Takes a final sealed backup, then removes HQ and its site from this machine. The backup, and its copy in the backup location, are kept for 30 days, during which hq restore brings everything back; then they are purged. It asks for HQ's address, typed in. At once by default, and the people in HQ are not told; with --on <date and time>, everyone in HQ sees a countdown until then, and it can be cancelled with schedule cancel." },
  { group: 'hq', usage: 'hq restore', does: 'Bring HQ back after an erase, within its 30 days',
    detail: 'Brings back an HQ erased on this machine, and its site, from the final backup the erase kept, while its 30 days last. To bring HQ back on a new machine from a backup location or an export: restore --from <folder or file>.' },
  { group: 'site', usage: 'site suspend | resume', does: 'As for HQ, for the site',
    detail: "suspend stops the site and keeps everything; HQ tells the people whose projects run there, and their runs pause. resume starts it again. --at <time> does either later, in this machine's time zone." },
  { group: 'site', usage: 'site erase | restore', does: 'Erase it at once; kept 30 days, then purged — or bring it back',
    detail: "erase takes a final sealed backup, then removes the site, its workspaces and its agent containers from this machine, after asking for the site's name. HQ says it has gone. The backup is kept for 30 days, during which site restore brings it back; then it is purged. On HQ's machine the site goes only with HQ: hq erase." },
  { group: 'hq', usage: 'hq address <address>', does: "Move HQ to a new address on this machine",
    detail: "Changing HQ's address is a move. HQ tells every connected site and host service, and the Fleet Console, the new address over the connection each already has, and tells everyone in HQ; then it stops, a sealed backup is taken, and it starts again at the new address. Each switches once the new address passes its check, and keeps the old one until then. A site or machine that was offline is pointed afterwards on its own machine, with console hq-address and site hq-address. If HQ does not answer at the new address, it is put back at the old one. With the front door on, turn it off first. It asks first; --yes answers for a script." },
  { group: 'hq', usage: 'hq move recover', does: 'Start HQ here again after a move that ended on neither machine',
    detail: "For one case only: HQ was moving to a new machine, this machine handed it over, but the new machine gave it back, so HQ runs on neither. First make sure HQ is not running on the new machine. It asks first, then starts HQ, its site and the Fleet Console if it ran here again from what this machine kept, and records that the move did not complete. Refused before the new machine's time to take over has passed, while this machine reaches HQ at its new address, and once the move completed. --yes answers for a script." },
  { group: 'hq', usage: 'hq fleet-admin [--remove] <user>', does: 'Give a person the fleet admin role, or take it away',
    detail: "Gives that person's HQ account the fleet admin role, which lets them open the Fleet Console. It never makes an account: they already have one. It is also how the role comes back when no fleet admin is left. HQ tells every fleet admin and organisation admin. It asks first; --yes answers for a script. With --remove it takes the role away instead; from this machine that works even for the last fleet admin." },
  { group: 'hq', usage: 'hq console-code', does: 'A one-time code to run the Fleet Console on another machine',
    detail: "A code that works once, for an hour, for console install on another machine — even a fleet admin's own computer. The Fleet Console that runs now is then retired. It asks first; --yes answers for a script. " +
      "--no-machines is for when the Fleet Console ran on another machine and that machine is lost: HQ makes the code itself, the new Fleet Console starts with no machines, and every machine — this one too, which leaves the one before — connects to it again with console connect. Never the default." },
  { group: 'console', usage: 'console connect <hq address> <code>', does: "Let the organisation's Fleet Console manage this machine",
    detail: 'With the code a fleet admin got from Add a site in the Fleet Console. It shows this machine\'s name and fingerprint, which you compare with the fleet admin before they confirm; then this machine pins the Fleet Console\'s identity, keeps one connection out to HQ and accepts none, and the Fleet Console starts its site, which takes part at once. Ctrl-C while it waits stops it, keeping nothing.' },
  { group: 'console', usage: 'console disconnect', does: 'Stop answering the Fleet Console',
    detail: "At once, even when the Fleet Console cannot be reached: this machine forgets the Fleet Console and its credential, and its site stops taking part in HQ, its data kept. Not on HQ's machine. It asks first; --yes answers for a script." },
  { group: 'console', usage: 'console install <hq address> <code>', does: "Run the Fleet Console on this machine instead of HQ's",
    detail: "With a code from hq console-code on HQ's machine. Starts the Fleet Console here, on 127.0.0.1:4300 of this machine only; it keeps one connection out to HQ and accepts none, and the one that ran before is retired. It asks first; --yes answers for a script." },
  { group: 'console', usage: 'console remove', does: 'Take away the Fleet Console on this machine, with its keys',
    detail: "For a Fleet Console HQ no longer lets in — retired while this machine was outside the fleet, so nothing removed it by itself (agenthix status says so). It stops and removes it, and deletes its keys, which cannot be brought back; a machine that still answers it connects to another again with console connect. Refused while this machine answers it, and on HQ's machine while it is the fleet's own. It asks first; --yes answers for a script." },
  { group: 'site', usage: 'site hq-address <address>', does: "Point the site at HQ's new address, after a move",
    detail: "For a site that was offline when HQ moved. First the check: the new address proves it holds the record of this site's credential, and the site proves it knows the credential, which never crosses the network. Only when it passes is the site started again with the new address. If it fails, nothing changes, and the address learned nothing from this site. Not on HQ's machine, whose site reaches HQ over a private Docker network." },
  { group: 'console', usage: 'console hq-address <address>', does: "Point this machine at HQ's new address, after a move",
    detail: "For a machine that was offline when HQ moved. The same check as for a site, on this machine's credential: it passes, or nothing changes. A Fleet Console installed on this machine is pointed too, after its own check. Run it before site hq-address: until this machine has the new address, the Fleet Console cannot reach it." },
  { group: 'site', usage: 'site logs [<part>]', does: "Show the site's recent logs",
    detail: "The site's recent log lines: site and site-db, or one of them. --lines <n> shows more or fewer (200 by default)." },
]

function option(args: string[], name: string): { value?: string; rest: string[]; bad?: boolean } {
  const i = args.indexOf(name)
  if (i < 0) return { rest: args }
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) return { rest: args, bad: true }
  return { value, rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

function flag(args: string[], name: string): { set: boolean; rest: string[] } {
  return { set: args.includes(name), rest: args.filter(a => a !== name) }
}

function logs(target: 'hq' | 'site', args: string[]): Command {
  const lines = option(args, '--lines')
  const n = lines.value === undefined ? 200 : Number(lines.value)
  if (lines.bad || !Number.isInteger(n) || n <= 0) return { kind: 'usage', message: '--lines takes a whole number of lines.' }
  if (lines.rest.length > 1) return { kind: 'usage', message: `${target} logs takes at most one part.` }
  return { kind: 'logs', target, service: lines.rest[0], lines: n }
}

function frontDoor(action: string | undefined, args: string[]): Command {
  if (action === undefined) return { kind: 'frontDoor', action: 'show', takePorts: false }
  if (action === 'off') return args.length ? { kind: 'usage', message: 'front-door off takes nothing more.' } : { kind: 'frontDoor', action: 'off', takePorts: false }
  if (action !== 'on') return { kind: 'usage', message: 'front-door takes on or off, or nothing to show how it is.' }
  const take = flag(args, '--take-ports-80-and-443')
  const files = option(take.rest, '--files')
  if (files.bad || files.rest.length) return { kind: 'usage', message: 'front-door on takes --files <host> and --take-ports-80-and-443, nothing else.' }
  return { kind: 'frontDoor', action: 'on', takePorts: take.set, filesHost: files.value }
}

function backup(args: string[]): Command {
  if (args.length === 0) return { kind: 'backupNow' }
  if (args[0] === 'export') {
    const to = option(args.slice(1), '--to')
    if (to.bad || to.rest.length) return { kind: 'usage', message: 'backup export takes --to <folder>, nothing else.' }
    return { kind: 'backupExport', to: to.value }
  }
  if (args[0] === 'location') {
    if (args.length > 2) return { kind: 'usage', message: 'backup location takes one folder: backup location <path>' }
    return { kind: 'backupLocation', path: args[1] }
  }
  return { kind: 'usage', message: `There is no command "backup ${args.join(' ')}".` }
}

export function parseCommand(argv: string[]): Command {
  const [first, second, ...rest] = argv
  if (!first || first === 'help' || first === '--help' || first === '-h') return { kind: 'help', topic: [second, ...rest].filter(Boolean).join(' ') || undefined }
  if (first === 'install') {
    const yes = flag([second, ...rest].filter((a): a is string => a !== undefined), '--yes')
    const address = option(yes.rest, '--address')
    if (address.bad || address.rest.length > 0) return { kind: 'usage', message: 'install takes --address <address> and --yes, nothing else.' }
    return { kind: 'install', address: address.value, yes: yes.set }
  }
  if (first === 'status' && !second) return { kind: 'status' }
  if (first === 'uninstall') return parseUninstall([second, ...rest].filter((a): a is string => a !== undefined))
  if (first === 'scheduled' && !second) return { kind: 'scheduled' }
  if (first === 'schedule') return parseSchedule([second, ...rest].filter((a): a is string => a !== undefined))
  if ((first === 'hq' || first === 'site') && second === 'schedule') return parseScheduleChange(first, rest)
  if ((first === 'hq' || first === 'site') && second === 'upgrade') return parseUpgrade(first, rest)
  if (first === 'upgrades') return parseUpgrades([second, ...rest].filter((a): a is string => a !== undefined))
  if (first === 'capacity') return parseCapacity([second, ...rest].filter((a): a is string => a !== undefined))
  if (first === 'front-door') return frontDoor(second, rest)
  if (first === 'backup') return backup([second, ...rest].filter((a): a is string => a !== undefined))
  if (first === 'restore') {
    const from = option([second, ...rest].filter((a): a is string => a !== undefined), '--from')
    if (from.bad || !from.value || (from.rest.length !== 0 && from.rest.length !== 2)) {
      return { kind: 'usage', message: 'Say where the backup is: restore --from <folder or file>, and for a site other than HQ\'s, HQ\'s address and the code: restore --from <folder or file> <hq address> <code>' }
    }
    if (!from.rest.length) return { kind: 'restore', from: from.value }
    const [address, code] = from.rest
    const problem = addressProblem(address)
    if (problem) return { kind: 'usage', message: `HQ cannot be at ${address}: ${problem}.` }
    if (!normalizeJoinCode(code)) return { kind: 'usage', message: `"${code}" is not a code: a code is twelve letters and digits, like 7KQ4-M2XD-46Q3.` }
    return { kind: 'restore', from: from.value, address, code }
  }
  if (first === 'hq') {
    if (second === 'invite-admin') {
      const yes = flag(rest, '--yes')
      return yes.rest.length ? { kind: 'usage', message: 'hq invite-admin takes no name.' } : { kind: 'inviteAdmin', yes: yes.set }
    }
    if (second === 'reset-password') {
      return rest.length === 1 ? { kind: 'resetPassword', user: rest[0] } : { kind: 'usage', message: 'Give the name the person types at sign-in: hq reset-password <user>' }
    }
    if (second === 'logs') return logs('hq', rest)
    if (second === 'console-code' || second === 'fleet-admin') return parseHqConsole(second, rest)
    if (second === 'address') return parseHqAddress('hq', rest)
    if (second === 'move') return parseHqMove(rest)
  }
  if ((first === 'site' || first === 'console') && second === 'hq-address') return parseHqAddress(first, rest)
  if (first === 'cloud') return parseCloud(second, rest)
  if (first === 'console') return parseCloudConsole(second, rest) ?? parseConsole(second, rest)
  if (first === 'site' && second === 'logs') return logs('site', rest)
  const verb = LIFECYCLE_VERBS.find(v => v === second)
  if ((first === 'hq' || first === 'site') && verb) return parseLifecycle(first, verb, rest)
  return { kind: 'usage', message: `There is no command "${argv.join(' ')}".` }
}
