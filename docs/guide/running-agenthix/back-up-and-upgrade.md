---
title: Maintenance and upgrades
description: Upgrade, move or suspend HQ and its sites now or at a time you choose, and what the people who use Agenthix see.
sidebar:
  order: 4
---

This page is for fleet admins, who plan maintenance in the Fleet Console, and for machine admins, who can do the same
with commands on a machine. It says how to upgrade, move or suspend HQ and its sites, and what the people who use
Agenthix see meanwhile.

An upgrade moves **HQ**, your organisation's home in Agenthix, or a **site**, where agents run, to a newer version.
It is one kind of *maintenance* that the **Fleet Console**, where fleet admins look after the machines, can do now or
schedule for later, with changing capacity, moving and suspending.
[HQ, sites and fleet admins](hq-sites-and-fleet-admins.md) explains each of these. The **Maintenance** page lists everything planned across the fleet, soonest first, each with its time,
what it does and who planned it, and what was done in the last 30 days.

![Maintenance, listing what is planned across HQ and the sites, and what was done in the last 30 days](screenshot:console-maintenance)

## Plan maintenance

Select **Plan maintenance** on the **Maintenance** page, or **Plan maintenance…** on HQ's page or a site's page. It
opens beside the page you are on. Choose **Which**, HQ or a site, and **What** to do; the form for it appears below.
Either choice can be changed at any time without losing what you typed. Then choose **When**, and select **Do it now**
or **Schedule for** the time you chose.

## Now or later

In **Plan maintenance**, choose HQ or a site, then **Upgrade**, and choose **Now** or **At a time…**. Now means in 5
minutes: the notice period is the same, so the people who use Agenthix are never surprised. The same choice is on the
machine:

```sh
agenthix hq upgrade                      # HQ and its site, in 5 minutes
agenthix hq upgrade --at "Sun 02:00"     # later
agenthix site upgrade --at "tomorrow 02:00"
```

`agenthix scheduled` lists what is scheduled on the machine. `agenthix schedule cancel <id>` calls one off, and
`agenthix schedule change <id> --at <time>` moves it. Maintenance that is running cannot be cancelled.

## What happens

1. **People are told** at once, in HQ: what will change and when.
2. **A few minutes before**, no new runs start on what is affected. Runs going then pause after their current step, and
   carry on afterwards.
3. **Every new image's signature is checked** before anything stops. An *image* is the packaged program Docker runs;
   each is signed when Agenthix publishes it, and the host service refuses one whose signature does not check, so
   nothing altered on the way can run on your machine.
4. **A sealed backup is taken**, encrypted so only its key opens it, then the new version starts.
5. **If it does not come up healthy** within 10 minutes (HQ answering as the new version, or the site connecting), the
   host service goes back to the version before, from that backup, by itself. `agenthix status` says so afterwards.

## What members see

People in the organisation see a notice in HQ, *Scheduled maintenance*, from the moment it is scheduled, with its time and
what it affects. When it starts, runs on what it affects pause. They carry on when the maintenance ends. Nothing is lost, and nobody has to do anything.

## Automatic fixes

Versions are numbered *major.minor.patch*, such as 1.4.2. A *fix* is a new patch version, the last number: it only
corrects mistakes. Fixes apply by themselves, on by default. Each is scheduled for
the start of the maintenance window, Sunday 02:00 to 04:00 unless moved, and people are told as for any change. It is
backed up first and rolled back if it does not come up healthy. A new minor or major version never applies by itself,
nor does a fix that was rolled back.

```sh
agenthix upgrades                        # show
agenthix upgrades auto off               # turn off, and cancel those scheduled
agenthix upgrades --window "Sun 02:00-04:00"
```

## The host service

The host service, the small program that runs Agenthix on every machine, switches itself to its newest version. A
program cannot replace itself while it runs, so it starts a *launcher*, a short-lived helper from its own image, which
swaps the old host service for the new one and puts the old one back if the new one does not answer. An upgrade of HQ
or a site moves the host service first when it is older. HQ and the site keep running throughout. If you turn the launcher off with
`agenthix upgrades host --launcher off`, you switch the host service by hand with the commands it prints.

## Suspend and resume

`agenthix hq suspend` stops HQ and its site and keeps everything. HQ tells people first, runs pause, and nothing new
starts until `agenthix hq resume`. In **Plan maintenance**, choose HQ, then **Suspend**, to do the same now or at a
time; **Resume HQ** is then on HQ's page. The same commands exist for a site: `agenthix site suspend` and
`agenthix site resume`.

## Move HQ

Moving HQ to another machine takes HQ and its site with it, and the Fleet Console too when it runs on HQ's machine:
fleet admins then carry on at `http://127.0.0.1:4300` on the new machine. The new machine joins with a one-time code,
as a new site's does, and waits for HQ. HQ becomes read-only from the moment the move's backup starts, so nothing is
lost, and removes its copy on the old machine once it answers on the new one. If it does not answer, HQ starts again
on the old machine.

- **If HQ's address is a domain name**, it keeps it: point the domain at the new machine in DNS, and every site and
  machine reconnects to the same address.
- **Otherwise** you give the new machine's address, and HQ tells its sites and machines the new address before it
  stops. One that was offline meanwhile is pointed afterwards on its own machine, with
  `agenthix console hq-address <address>` and then `agenthix site hq-address <address>`. In **Plan maintenance**, choose HQ,
then **Move**, or run
`agenthix hq schedule move --at <time> [--address <new address>]`.

If a move ended with HQ running on neither machine, make sure it is not running on the new one, then run
`agenthix hq move recover` on the old machine.
