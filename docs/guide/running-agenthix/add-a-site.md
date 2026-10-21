---
title: Add, move or remove a site
description: Bring another machine into the fleet as a site, move a site to a new machine, or take one out.
sidebar:
  order: 5
---

This page is for fleet admins, working with the machine admin of each new machine: how to add a site on another
machine, move a site to a new machine, or take one out.

A **site**, short for Execution Site, is where agents run, on a machine of its own. **HQ** is your organisation's home
in Agenthix. A **fleet admin** looks after the machines in the **Fleet Console**; a **machine admin** is anyone who can
use Docker on a machine. [HQ, sites and fleet admins](hq-sites-and-fleet-admins.md) explains each. Your install
already has one site, beside HQ. Add more to run agents on a bigger machine, or closer to your code.

A site starts agent containers through its machine's Docker, and those agents can reach the internet and the other
computers on that machine's network, as [What agents can reach](#what-agents-can-reach) explains. Add a site only to a
machine whose owner agrees, on a network where that is safe.

## Add a site

1. In the Fleet Console, select **Add a site**, at the top of the **Dashboard**, then **Continue** under **A new site**.
   It shows a one-time code, valid for one hour, to give to the machine admin of the new machine.
2. On the new machine, the machine admin starts the host service, the small program that runs Agenthix on every
   machine, as steps 1 to 3 of [Install Agenthix](../getting-started/install.md#install) describe. They stop there,
   and don't run `agenthix install`: that would make a second HQ. The machine needs Docker with Compose v2, a way to
   reach HQ's address, and nothing else of Agenthix running.
3. On that machine, the machine admin runs the command with HQ's address and the code:

   ```sh
   agenthix console connect <hq address> <code>
   ```

   The machine connects to HQ at that address, on its port: 443 for an `https://` address without one. It must be
   one the new machine can open: `localhost` will not do. If HQ still has one, change it first, as
   [Address and front door](domain-and-https.md#what-a-servers-address-needs) describes.
4. The command shows this machine's **name** and **fingerprint**, a short code worked out from the machine's own key.
   At the same moment, the Fleet Console's **Add a site** page moves to **Step 2 of 2** and shows the same two. The
   machine admin reads them to the fleet admin, who compares them. The fingerprint proves that the machine the fleet
   admin approves is the one the code was typed on; if they differ, select **Refuse**.
5. The fleet admin selects **Confirm** followed by the machine's name, such as **Confirm office-server**, in the Fleet Console. The site then starts on the machine and joins HQ, named after the machine.

`Ctrl-C` while the command waits stops it and keeps nothing.

![Add a site, step 1 of 2: a one-time code and the command to run on the new machine](screenshot:console-add-site)

![Add a site, step 2 of 2: the new machine's name and fingerprint, to compare before selecting Confirm](screenshot:console-add-site-confirm)

If a new machine is to take the place of a lost one, use [Restore a lost site](backups-and-restoring.md#restore-a-lost-site) instead.

## Move a site to a new machine

A move keeps the site's credential, the secret it proves itself to HQ with, and its workspaces, the project files on
it. Its projects stay on it, and show its new name: the site takes the new machine's name, as every site is named
after its machine.

1. On the site's page in the Fleet Console, select **Plan maintenance…**, choose **Move**, and choose when. Moving takes the site
   offline for a while, so choose a time that suits the people whose projects run there. HQ tells them from the moment
   it is scheduled.
2. The Fleet Console gives a one-time code. On the new machine, where only the host service runs, the machine admin
   runs `agenthix console connect <hq address> <code>`, and you compare the name and fingerprint as for a new site.
   The new machine then waits for the site.
3. At the chosen time, the old machine stops the site and takes a final backup. It sends the backup to the new machine
   through HQ, sealed so that only the new machine can open it. The site starts on the new machine from it. The old
   machine removes its copy and leaves the fleet once the site answers from the new machine.

If the site does not answer from the new machine, it starts again on the old one, as it was.

To move HQ itself, with its own site and the Fleet Console, see [Maintenance and upgrades](back-up-and-upgrade.md#move-hq).

## Remove a site

- **Disconnect it in the Fleet Console.** On the site's page, select **Disconnect…** and type the machine's name. HQ
  forgets the site and the machine: the site stops taking part in HQ, and nothing on the machine is removed.

The rest are commands the machine admin types on the site's machine.

- **Disconnect it on the machine.** On the site's machine, `agenthix console disconnect` makes the machine forget the Fleet Console at
  once, even when the Fleet Console cannot be reached. The site stops taking part in HQ, and its data stays on the
  machine. It asks first. The Dashboard then lists the machine under **Left the fleet**, where
  **Remove from the list** takes it off for good.
- **Erase it.** `agenthix site erase` takes a final backup, then removes the site, its workspaces and its agent
  containers from the machine. The backup is kept for 30 days, and `agenthix site restore` brings the site back within
  them. Then it is purged. HQ's own site cannot be erased on its own: it goes only when HQ is erased, with
  `agenthix hq erase`.
- **Suspend it** to stop it and keep everything: `agenthix site suspend`, and `agenthix site resume` to start it again.
  Runs on it pause meanwhile.

Projects on a site that goes stop until you move them to another site.

## A site that was off when HQ's address changed

A site that was offline when HQ moved to a new address is pointed at it on its own machine, with
`agenthix console hq-address <address>` and then `agenthix site hq-address <address>`. [Address and front door](domain-and-https.md#change-hqs-address) says when.

## How many runs at once

A site runs 5 agent runs at once by default; more wait for a slot. To change it, select **Plan maintenance…** on the site's page and choose **Change capacity**, or
`agenthix capacity set --containers <n>` on its machine. Memory usually runs out first: take the machine's memory,
subtract what its system, HQ and the databases need, and divide the rest by the most one run uses.

## What agents can reach

An agent runs in a container on its site's machine. The host service keeps agents off the machine itself, with
firewall rules that stop an agent reaching:

- the machine's own ports, such as its SSH server or a database running on it;
- ports that other containers publish on the machine;
- the address a cloud provider's machine asks for its credentials.

The rules have no setting and cannot be turned off. On a site's page in the Fleet Console, **Protections** says whether
they are **In place**; while they are not, no new agent starts on that site.

Agents keep ordinary internet access, and can reach the other computers on the machine's network. So an agent that
follows an instruction planted in something it reads could send the project it works on to an internet address, or
try a computer next to it. Put a site on a network where nothing an agent shouldn't touch can be reached.
The [deployment notes](https://github.com/solution84-com/agenthix/blob/main/docs/architecture/deployment.md#agents-keep-internet-access)
say more.
