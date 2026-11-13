---
title: Commands on a machine
description: Every agenthix command the host service understands, and what each one does.
sidebar:
  order: 8
---

This page is for machine admins, anyone who can use Docker on a machine: every `agenthix` command, and what it does.

The **host service** is the small program on every machine in the fleet that installs and runs **HQ**, your
organisation's home in Agenthix, and the **site** there, where agents run.
[HQ, sites and fleet admins](hq-sites-and-fleet-admins.md) explains each. Its commands are `agenthix …`, typed on
that machine. Run them in the host service:

```sh
docker exec -it agenthix-host agenthix <command>
```

Most things have a screen in the Fleet Console, where fleet admins look after the machines, too; the commands are for a machine you are standing at, a script, or when
the Fleet Console cannot be reached. A command that changes something **asks first**; `--yes` answers for a script.
Times are in the machine's own time zone. `agenthix help` lists the commands, and `agenthix help <command>` explains one.

## The machine

| Command | What it does |
|---|---|
| `install` | Installs HQ and its site here. It asks where people will open HQ, starts both and prints one link for the first account. Run again, it starts what is stopped and changes nothing that is set. `--address <address>` answers the question. `--demo` installs a public demo instead: scripted agents, no Docker socket for the site, no Fleet Console, no nightly backup, and a reset every 6 hours |
| `demo reset [--yes]` | On a demo installation only: wipes the demo's data now and starts it again from the sample, as the scheduled reset does. It asks first |
| `status` | Every HQ and site on this machine, each in a sentence that ends in what to do next. Each part shows the version it runs, and "unchanged since" an earlier version when its image has not changed since that release |
| `capacity` | Shows what each agent may use: memory, processors and processes per container, and how many containers run at once |
| `capacity set` | Changes them, with `--memory <size>`, `--processors <n>`, `--processes <n>` and `--containers <n>`. They must fit the machine. HQ and projects may narrow them for a run, never raise them |
| `front-door [on \| off]` | Shows, turns on or turns off the host service's own *front door*, the program that serves HQ over HTTPS with its certificates. See [Address and front door](domain-and-https.md) |
| `front-door add-installation <namespace>` and `remove-installation <namespace>` | Has this front door also serve another installation on the machine, such as a public demo installed with `install --demo`, or stops serving it. Needs the front door on and DNS pointing at both of that installation's addresses. Remove it before erasing that installation |
| `backup` | Takes a backup now, *sealed*: encrypted, so only its key opens it |
| `backup export` | Takes one and seals it to a key made for that file alone, shown once. `--to <folder>` chooses where it is written |
| `backup location [<path>]` | Shows the folder for backup copies, or chooses one |
| `restore --from <folder or file>` | On a machine where nothing runs yet, brings back HQ and its site, or, with HQ's address and a code, a lost site, from a backup. See [Backups and restoring](backups-and-restoring.md) |
| `scheduled` | Lists the scheduled maintenance, soonest first |
| `schedule cancel <id>` | Cancels scheduled maintenance |
| `schedule change <id> --at <time>` | Moves scheduled maintenance to another time |
| `upgrades` | Shows whether fixes apply by themselves, and when |
| `upgrades auto off` | Turns automatic fixes off, and cancels any scheduled. `auto on` turns them on; `--window "<day> <from>-<to>"` moves the window |
| `upgrades host` | Switches the host service to its newest version. `--launcher off` turns the automatic switch off. On a development build only, `--image <name or id>` switches to another image built on the machine |
| `uninstall` | Takes Agenthix off this machine and leaves nothing behind: the Fleet Console, the agent containers, the firewall rules, the volumes, networks and images, the state folder, and the host service itself, last. Refused while HQ or a site is here: erase it first. Your backup location is never touched. See [Take Agenthix off a machine](uninstall.md) |
| `help [<command>]` | The list of commands, or one in detail |

## HQ (on HQ's machine)

| Command | What it does |
|---|---|
| `hq invite-admin` | A link for the first account on a fresh install, or an invitation to join as an organisation admin when none is left. See [When nobody can sign in](recover-admin.md) |
| `hq reset-password <user>` | A one-time link, valid for an hour, to set a person's password |
| `hq fleet-admin [--remove] <user>` | Gives a person's HQ account the fleet admin role, or takes it away |
| `hq upgrade [<version>]` | Upgrades HQ and its site now, after a backup, or to the version named. `--at <time>` schedules it instead. See [Maintenance and upgrades](back-up-and-upgrade.md) |
| `hq schedule upgrade --at <time>` | Schedules HQ's upgrade, its site with it |
| `hq schedule move --at <time> [--address <new address>]` | Moves HQ, its site and the Fleet Console to a new machine |
| `hq move recover` | Starts HQ here again after a move that ended with it on neither machine |
| `hq address <address>` | Moves HQ to a new address. See [Address and front door](domain-and-https.md#change-hqs-address) |
| `hq suspend` and `hq resume` | Stops HQ and its site, keeping everything; starts them again. `--at <time>` does either later |
| `hq erase [--on <date>]` | Takes a final backup, then removes HQ and its site from this machine. The backup is kept for 30 days, then purged. With `--on`, everyone in HQ sees a countdown |
| `hq restore` | Brings back an HQ erased here, within its 30 days |
| `hq logs [<part>]` | HQ's recent log lines: `hq-server`, `hq-web` and `hq-db`, or one of them. `--lines <n>` shows more or fewer |
| `hq console-code` | A one-time code to run the Fleet Console on another machine, retiring the current one |
| `provider add <vendor> [--name <name>] [--address <address>]` | Adds one of the organisation's model or voice providers: `anthropic`, `openai`, `google`, `openrouter`, `openai_compatible`, `assemblyai` or `inworld`. It asks for the key, not shown as you type; from a script, pipe it in. The key is checked with the vendor first. `openai_compatible` needs `--address`. Every organisation admin is told. See [Providers](../your-tools/providers.md#from-a-terminal) |
| `provider list` | The organisation's providers, what each provides (LLM, STT, TTS), whether it works, and its key's last four characters |
| `provider remove <vendor> [--yes]` | Removes a provider after asking. Whatever used it falls to another of its type, and the answer says what. Refused when it would leave no model, speech-to-text or text-to-speech provider |

## The site (on its machine)

| Command | What it does |
|---|---|
| `site upgrade [<version>]` | Upgrades the site now, after a backup. `--at <time>` schedules it instead |
| `site schedule <change> --at <time>` | Schedules an upgrade, resize, suspend, resume or move of the site |
| `site suspend` and `site resume` | Stops the site and keeps everything; starts it again |
| `site erase` and `site restore` | Erases the site, kept 30 days, or brings it back |
| `site hq-address <address>` | Points the site at HQ's new address after a move, once the address passes a check |
| `site logs [<part>]` | The site's recent log lines: `site` and `site-db`, or one of them |

On HQ's machine the site goes no further than HQ, so `site erase` and `site hq-address` are for sites on other machines.

## Joining the fleet

| Command | What it does |
|---|---|
| `console connect <hq address> <code>` | Lets the organisation's Fleet Console manage this machine, with the code from **Add a site**. Shows the machine's name and fingerprint to compare |
| `console disconnect` | Stops answering the Fleet Console, at once, even when it cannot be reached. The site stops taking part in HQ and its data is kept |
| `console hq-address <address>` | Points this machine at HQ's new address. Run it before `site hq-address` |
| `console install <hq address> <code>` | Runs the Fleet Console on this machine instead of HQ's, with a code from `hq console-code`. It listens on this machine only |
| `console remove` | Removes a Fleet Console that HQ no longer lets in, with its keys |

## Remote access

| Command | What it does |
|---|---|
| `console remote on \| off` | Remote access is not available yet, so `on` says so and changes nothing. `off` closes it at once, on the Fleet Console's machine |
| `console reset-code [--yes] <user>` | On the Fleet Console's machine, beside HQ: forgets that fleet admin's authenticator code and recovery codes, for example after a lost phone. They set up a new one the next time they open the Fleet Console remotely |

These two only check where they run and what you typed. See
[HQ, sites and fleet admins](hq-sites-and-fleet-admins.md#remote-access).
