---
title: You've just become a fleet admin
description: What a fleet admin looks after, how to reach the Fleet Console, and what to check on your first visit.
sidebar:
  order: 1
---

This page is for someone who has just been given the **fleet admin** role. Being a fleet admin means looking after
the machines Agenthix runs on, from the **Fleet Console**. [Run it on a server](index.md) explains the parts named here.

## What you look after

The **fleet** is HQ, your organisation's home in Agenthix, and its sites, the machines where agents run. As a fleet
admin, you look after:

- **that each machine is working**: HQ, and every site;
- **backups**: that each machine backs up every night, and that the copies are kept somewhere other than the machine;
- **maintenance**: upgrades, moves and pauses, planned at times that suit the people who use Agenthix;
- **adding, moving and removing sites**;
- **who else is a fleet admin**: you can give the role to someone, or take it away.

You don't look after the people, projects or agents in HQ: that is the **organisation admins**' job, and being a
fleet admin does not make you one. Nor do you look after each machine itself, its system, network and disks: that is
its **machine admin**, whoever can use Docker on it. Some jobs need them, such as choosing where backups are copied, or
typing a code on a new machine. Find out who the machine admin of each machine is.

You were given the role by another fleet admin, or by the machine admin of HQ's machine. HQ told every fleet admin and
organisation admin when you got it.

## Reach the Fleet Console

The Fleet Console answers only on the machine it runs on, HQ's machine unless it was moved, at
`http://127.0.0.1:4300`: `127.0.0.1` is the address a machine uses to reach itself. That is on purpose: nobody can
reach it from the network.

- **If you can sit at HQ's machine**, open that address in its browser.
- **Otherwise**, ask the machine admin of HQ's machine, usually whoever installed Agenthix, for an account on it that
  can sign in over SSH. Then, on your own computer, open a tunnel and leave it running:

  ```sh
  ssh -L 4300:127.0.0.1:4300 <you>@<hq machine>
  ```

  and open `http://127.0.0.1:4300` in your own browser.

Sign in with your HQ username and password. If it says *This account isn't a fleet admin*, the role has not reached
your account yet: ask whoever gave it.

## Your first visit

![The Fleet Console's Dashboard, with HQ at the centre and each site by its machine's name, with its state](screenshot:console-dashboard)

1. **Read the Dashboard.** It opens with HQ, then **The fleet**: each site by its machine's name, with its state in
   words, such as **Healthy**, **Needs attention** or **Not answering**. Its first line says how many sites there are,
   and whether anything needs you. Anything that does is listed under it, in **Needs you**, each with a button to open
   it. Below are the totals: **Agents running**, **Next maintenance**, **Backups**, how many machines keep their
   copies off the machine, and **Remote access**, which is **Off** until the organisation is connected to Agenthix
   Cloud (see [HQ, sites and fleet admins](hq-sites-and-fleet-admins.md#agenthix-cloud-and-remote-access)).
2. **Open the notices.** The bell at the top holds notices for you: a machine that left the fleet or has not been
   heard from, something done that every fleet admin is told about, the role given or taken away. Each stays until you
   dismiss it, or, for a machine, until it is back. **Activity**, in the menu, is the full record of what was done and
   by whom.
3. **Check the backups.** Open **Backups**: each machine should show last night's backup, and the page says how many
   keep their backups on their own machine only. A site's page marks such a machine **On this machine only**. It has
   no copy elsewhere, so **if that machine is lost, its backups are lost with it**. Ask
   its machine admin to choose a backup location, as [Backups and restoring](backups-and-restoring.md#where-the-copies-go)
   describes: it is set only on the machine itself, never from the Fleet Console.
4. **Choose who is told when a machine stops.** On each site's page, **Notify…** sets whether every fleet admin is
   told when that machine stops answering. Leave it on for servers; turn it off for a laptop or any machine often
   switched off, or the notices will mean nothing. HQ's own machine is always watched.
5. **Check who else is a fleet admin.** Open **Fleet admins**. If you are the only one and become unreachable, nobody
   can look after the fleet until a machine admin of HQ's machine gives the role to someone else, so ask for a second.
6. **Know where help is.** **Help**, at the bottom of the menu, shows these pages. Each screen also has a
   **How this works** link to the part that explains it.

![Activity, the record of what was done in the Fleet Console and at the command line, newest first, with who did each](screenshot:console-activity)
