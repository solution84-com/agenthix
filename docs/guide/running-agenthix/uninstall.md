---
title: Take Agenthix off a machine
description: Remove everything Agenthix put on a machine with one command, and what it never touches.
sidebar:
  order: 11
---

This page is for machine admins, anyone who can use Docker on a machine. `agenthix uninstall` takes Agenthix off the
machine it runs on and leaves nothing of it behind: no container, volume, network, firewall rule or folder.

## Before you start

The uninstall never deletes what an erase would keep, so it is refused, and changes nothing, while any of these is
true. It says which, and what to do.

- **HQ or a site is on the machine**, running or suspended. Erase it first: `agenthix hq erase` on HQ's machine, which
  takes its site with it, or `agenthix site erase` on another machine. An erase takes a final backup and keeps it for
  30 days. See [Add, move or remove a site](add-a-site.md#remove-a-site).
- **The Fleet Console was installed here** with `agenthix console install`. Removing it deletes its keys, so if it is
  the one your fleet uses, move it first, with `agenthix hq console-code` on HQ's machine. One that HQ no longer lets in
  goes with `agenthix console remove`. A Fleet Console that came with HQ goes with the uninstall.
- **Agenthix Cloud runs the machine.** It is taken off through Cloud.
- **The backup location is inside the state folder**, the folder the host service keeps its settings and backups in
  (`~/.agenthix` in the [install command](../getting-started/install.md)). Choose one outside it first, with
  `agenthix backup location <path>`.

**An erase you made in the last 30 days.** Its final backup is still kept on the machine, and `agenthix hq restore` or
`agenthix site restore` can bring it back. The uninstall says until when it is kept, and purges it now only once you
type HQ's address, or the site's name, as the erase asked for it; then it cannot be brought back. Press Enter instead
to keep it, and uninstall after that date. The copies in your backup location are not touched either way.

**Exports.** An export written without `--to` is in the state folder's `exports` folder, which goes. Copy any you want
to keep out of it first.

## Uninstall

```sh
docker exec -it agenthix-host agenthix uninstall
```

It lists exactly what it will remove on this machine, and asks. `--yes` answers for a script, but never the question
about an erase still kept. Then it removes, in this order, and says how each step went:

1. It leaves the Fleet Console, if this machine answers one on another machine, and tells HQ.
2. The Fleet Console on this machine, with its keys.
3. The agent containers, and any other container left in the install's groups.
4. The agent protections' firewall table, `agenthix_agents`, and from then on nothing puts it back.
5. The install's volumes and networks, each by its name.
6. The images it fetched for HQ, the site and the Fleet Console, of any version, unless another container uses one.
7. What is in the state folder, with the backups in it, and the host service's own container, last. A container
   cannot remove itself, so a short-lived helper, `agenthix-host-uninstall`, does this a few seconds after the command
   has answered, then removes itself.

It never touches your backup location, or anything on the machine not named after the install. The helper is given
the state folder alone, so it cannot reach anything beside it: it empties the folder and leaves it, and the uninstall
prints the command that removes the empty folder, such as `rmdir ~/.agenthix`. The folder is emptied only when it holds
nothing but what the host service wrote there. If it holds anything else, such as files of your own, nothing in it is
removed: the uninstall names what else it found, and you can delete the folder yourself once you have checked it. The
host service's own image stays, because the helper runs from it; the uninstall prints the command that removes it
afterwards, `docker image rm <id>`.

## If something is left

A step that fails is said, and the rest still run. The uninstall ends by listing what it did not remove, and why.
Run it again: it removes what is left, and finds nothing to fail on in what is already gone.

If the helper could not finish, it stays, stopped, so `docker ps -a` lists `agenthix-host-uninstall`, and
`docker logs agenthix-host-uninstall` says what it left. If the host service is gone by then, start it again with
the command it was first started with, then run `agenthix uninstall` again.
