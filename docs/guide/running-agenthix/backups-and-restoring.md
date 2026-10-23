---
title: Backups and restoring
description: How each machine backs itself up every night, where the copies go, how to export one, how to go back to an earlier night, and how to bring a lost site back.
sidebar:
  order: 3
---

This page is for fleet admins, who follow backups in the Fleet Console, and for machine admins, who choose where the
copies go and bring a lost machine back. It says how backups work, and how to restore from one.

Every machine in the fleet backs itself up, with no setting to turn on. The **fleet** is **HQ**, your organisation's
home in Agenthix, and its **sites**, the machines where agents run; [HQ, sites and fleet admins](hq-sites-and-fleet-admins.md)
explains them. A backup of a site holds everything the site has: its database, its project files and the credential it proves
itself to HQ with. On HQ's machine the backup holds HQ as well: its database, its stored files and its secrets, and the
Fleet Console's own state when it runs there. Each backup is *sealed*: encrypted, so that a copy that leaves the
machine is unreadable without its key.

**By default, the backups stay on the machine that took them, so if the machine is lost, its backups are lost with
it.** Choose a backup location for every machine, as [Where the copies go](#where-the-copies-go) describes.

## Every night

Each machine takes a backup every night at 02:00, by its own clock. The **Backups** page in the Fleet Console lists HQ
and every site, when each last backed up, what it holds, and whether the last one failed; a site's page says
**On this machine only** when its backups have no copy elsewhere. Nightly backups wait while a machine is
suspended, and start again when it is resumed.

![Backups, listing HQ and each site with when it last backed up, and Back up now and Export beside each](screenshot:console-backups)

Only one backup, restore, upgrade, move or erase runs on a machine at a time, and each of the last three takes its own
backup first. When two fall due together, neither is lost:

- **An upgrade, move or erase scheduled for 02:00 waits for the nightly backup** to finish, for up to 30 minutes, and the
  **Maintenance** page says it is waiting. If the backup is still running after that, the change does not happen,
  nothing is changed, and the page says why. To avoid the wait, schedule them for another time, such as 04:00.
- **A nightly backup that finds a change running takes its backup as soon as the change ends**, the same night. Only
  if the machine is still busy when the night is over is that night skipped: the **Backups** page shows the last
  backup as failed, and `agenthix status` on the machine says why.

To take one now, select **Back up now** beside it on the **Backups** page, or run this on the machine:

```sh
agenthix backup
```

## Where the copies go

By default a backup stays on the machine that took it. **If the machine is lost, so is the backup.** A machine admin
chooses a *backup location* on each machine to keep copies somewhere else: any folder the machine can write to, such
as a shared folder on a network drive, a folder a sync service copies elsewhere, or cloud storage mounted as a folder,
as that machine sees it.

```sh
agenthix backup location <path>
```

The command tests that it can write to the folder, then shows the key the copies are sealed to, once. Each machine
has its own. **Write that key down and keep it away from the machine**: without it the copies cannot be opened, here
or on any other machine, and nobody can get it back. Choosing a new location makes a new key; copies already written
stay sealed to the old one. From then on, each nightly backup is
copied there too. The location is set only on the machine itself, never from the Fleet Console, because it decides where
sealed data leaves the machine. `agenthix backup location` with no path shows the current one.

## Export a backup

An export is a backup you carry yourself, for a machine with no backup location, or to keep a copy off the network.
Select **Export…** beside it on the **Backups** page, or **Export a backup…** on its own backups page, or run:

```sh
agenthix backup export
```

It takes a backup, then seals it to a key made for that file alone, and shows the key once. The file is useless without
it. It is written to the exports folder in the host service's state folder, or to the folder you name with
`--to <folder>` on that machine.

## Go back to an earlier night

When something went wrong on a machine that still runs, such as a mistake or a bad night, restore one of its own
backups on that machine. HQ's machine goes back with HQ and its own site together; any other machine, its site alone.
**Anything done since that night is lost**, so the machine takes a backup of what is there now first, and that backup
is listed with the others, so the restore can be undone the same way.

![One machine's backups, listing the nights it can go back to, newest first, each with Restore](screenshot:console-site-backups)

1. In the Fleet Console, open **Backups** and select HQ or the site. Its page lists the nights it can go back to,
   newest first: those kept on the machine, and those in its backup location.
2. Select **Restore…** beside the night. **Plan maintenance** opens on **Restore a backup** with that night chosen.
   You can also start there: **Plan maintenance…**, then HQ or the site, then **Restore a backup**, then the night.
3. Read what happens, and type the machine's name to confirm.
4. Choose **Now** or **At a time…**. At a time, the members whose work it affects see a notice from when it is planned,
   as for any maintenance; now, they are not told before. Either way, once the site is back, HQ tells its
   organisation admins what was lost.
5. Select **Do it now** or **Schedule for…**. The machine stops HQ or the site, restores it to that night, and starts
   it again. A site keeps its name and its connection to HQ.

A night that is only in the backup location needs that location's key, the one shown when the location was set. It is
restored now only: the key is sent sealed to the machine for that restore and kept nowhere, so it cannot wait for a
later time. A night kept on the machine needs no key.

The Fleet Console beside HQ is left as it is: going back to an earlier night does not change which machines it knows.
While HQ is being restored, nobody can sign in, and the Fleet Console cannot hear from HQ's machine; HQ's page shows
it again once it is back.

There is no command for this on the machine. `agenthix restore --from` is for a new machine only, and on a machine
that runs HQ or a site it says where in the Fleet Console to go instead.

## Restore a lost site

When a site's machine is lost, restore its site onto a new machine from a backup. You need a copy that left the
machine: one in its backup location, or an export. Restoring replaces the lost machine, and **anything the site did
after the backup was taken is lost**. Be sure the machine is really gone, not just switched off for a while: once the
site is restored elsewhere, HQ refuses the old machine if it comes back. Every fleet admin and organisation admin is
told.

1. In the Fleet Console, open **Backups** and select **Restore a lost site…**, or select **Add a site** and then **Restore from a backup…**. Choose the lost site, tick that you understand what is lost, and select **Make a code for the new machine**. It shows a one-time code, to give to the machine admin of the new machine.
2. On the new machine, which runs nothing yet but the host service, the machine admin runs:

   ```sh
   agenthix restore --from <folder or file> <hq address> <code>
   ```

   `--from` is the backup location folder, or an export file. The command lists the backups it finds, and asks which night
   and for the key. It checks the key. The key is typed here and never leaves this machine.
3. The command shows the machine's name and fingerprint, a short code worked out from the machine's own key. The fleet admin compares them and confirms in the Fleet Console with **Confirm**, followed by the machine's name.
4. The site is restored on the new machine, and takes the place of the lost one. As a site is named after its machine,
   it takes the new machine's name. Its projects stay on it, and show its new name.

## Restore HQ

HQ's machine is restored the same way, without a code, since there is no Fleet Console to give one while HQ is down.
On a new machine that runs nothing yet but the host service, the machine admin runs
`agenthix restore --from <folder or file>`. HQ and its site come back as they were that night, with HQ's address
unchanged.

- **The Fleet Console**, if it ran on HQ's machine, comes back with them: fleet admins carry on at
  `http://127.0.0.1:7801` on the new machine.
- **If HQ's address is a domain name**, point it at the new machine in DNS. HQ answers there once it does, and the
  other sites and machines reconnect to it by themselves.
- **If HQ's address is a network address** of the old machine, such as `http://192.168.1.20:7800`, give HQ the new
  machine's address with `agenthix hq address <address>`. Every other machine was cut off from HQ meanwhile, so on
  each one, its machine admin then runs `agenthix console hq-address <address>`, then
  `agenthix site hq-address <address>`.

For HQ erased by mistake on the same machine, see `agenthix hq restore` in [Commands on a machine](commands.md).

## What a backup does not hold

A backup holds everything HQ and the site need, their secrets included, so the only thing to keep apart from it is
its key. Two things come from the machine it is restored on instead:

- **The machine's name**, so a restored site takes the new machine's name.
- **The host service's front door.** After a restore on a new machine it is off: turn it on again with
  `agenthix front-door on`, as [Address and front door](domain-and-https.md#the-machine-has-no-web-server-yet)
  describes.
