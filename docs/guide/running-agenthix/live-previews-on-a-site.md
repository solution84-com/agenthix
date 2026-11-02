---
title: Live previews on a site
description: Switch live previews on for a site, set how many may run and when they stop, watch their capacity, and give them an address.
sidebar:
  order: 6
---

This page is for fleet admins. A **live preview** runs the app an agent is building in a container of its own, on an
**Execution Site**, and shows it to a person in HQ: see [Live previews](../projects/live-previews.md). **HQ** is your
organisation's home in Agenthix, and a site is where agents run. A live preview needs two things from you: a site that
allows it, and an address for each app.

## Allow live previews on a site

Open the site's page in the **Fleet Console**. **Live previews on this site** shows **On** or **Off**.

- **HQ's own site is on by default.** Every other site you add is off until you turn it on, because a live preview runs
  an app's code with network access, and a machine you add may be somewhere you want to keep quieter.
- Select **Turn live previews on** to allow them. Select **Turn live previews off…** to stop allowing them.
  Turning them off lists the live previews open on the site and stops all of them after you confirm. Each person is told, and
  their branches and work are untouched.
- The page also shows why a site cannot start one now, for example when its guard is not running.

Two settings sit beside the switch. Select **Change limits…** to edit them, then **Save**:

| Setting | Meaning | Default |
|---|---|---|
| **Live previews at once** | The most that may be open on the site. Lowering it stops nothing: new ones wait for room | No limit |
| **Stop when unused for (minutes)** | How long a live preview nobody has open, with no run on its branch, stays up before it stops | 2 hours; at least 5 minutes |

## Capacity

**Capacity** shows what the site's live previews use against the machine: how many are open of the limit, the share of the
machine's memory and processors they use, and **Busy** when memory is past 80%. Disk, working copies included, is on the
machine's health card. Each live preview also has its own ceiling of memory, processors and processes.

Fleet admins are told:

- when a site passes 80% of its memory or its disk, and when it is back under, so a site near the line isn't told twice a
  minute (memory recovers under 70%);
- when a live preview is stopped because the machine ran out of memory.

Each notice opens the site's page. **Live previews open** lists them: whose, the project and workspace, the branch, when it
was last used and its state. **Stop** stops one, after a confirmation that names the person.

Set **Live previews at once** to what the machine holds, since there is no limit until you set one.

![office-server's Live previews in the Fleet Console: on, six at once, stopped after two hours unused, its capacity, and two live previews open, each with Stop](screenshot:console-site-live-previews)

## Give live previews an address

Each app a live preview runs has an address of its own, `p-<id>.<preview domain>`, so one app can't read another's pages.
What that needs depends on how HQ is reached:

| HQ is reached by | Live previews | Apps are opened at |
|---|---|---|
| A domain name, on a server | Work | `https://p-<id>.<preview domain>` |
| `http://localhost`, on a laptop running HQ | Work, for that laptop's own browser only | `http://p-<id>.preview.localhost:<HQ's port>` |
| A bare network address | Do not work. Branches and merging do; **Live preview** says a domain is needed | None |

On a laptop, the app's address only works in a browser that sends every `*.localhost` name to the laptop itself.
Chrome, Edge and Firefox do. Safari on macOS doesn't, so open live previews in one of the others there.

For a server with a domain:

1. Choose a preview domain that is not HQ's own name, such as `preview.example.com` when HQ is `hq.example.com`.
2. Add one wildcard DNS record, `*.preview.example.com`, pointing at the machine, as you did for HQ's name.
3. Turn the host service's front door on with that domain:

   ```sh
   agenthix front-door on --files files.example.com --previews preview.example.com
   ```

   Leave `--files` out if you use the default. The front door gets a certificate for each app the first time it is opened,
   so the first open of a new app takes a few seconds. It asks HQ first, and only an app HQ knows gets one.
4. The command checks that DNS reaches the machine, that its port 443 answers with a certificate a browser accepts, and
   that HQ's relay answers behind it. If a check fails, it says which and puts everything back as it was.

If you run your own web server instead, send the wildcard name to the same place as HQ and give it a certificate that covers
the wildcard: see [Address and front door](domain-and-https.md#live-previews).

## Where next

- [Live previews](../projects/live-previews.md): what people see and do.
- [Address and front door](domain-and-https.md): HQ's address, HTTPS and the front door.
- [HQ, sites and fleet admins](hq-sites-and-fleet-admins.md): how sites are named and found.
