# Execution Sites

Part of the unit's design spec: see [the index](README.md).

## Execution Sites

Agreed on its own mockup. **Organisation › Infrastructure › Execution Sites** lists the machines that run the
organisation's agents and keep its project files, for organisation admins.

- **HQ has a site.** The site that comes with HQ is named **HQ**, marked *Built in*: to people, HQ is one thing that
  comes with its own site. It stays a separate process on the same control channel as every other site, because the
  site holds Docker and HQ the organisation's data and secrets. How the two pair is reviewed with host management.
- **The list is grouped by what needs an admin.**
  - **Asking to connect** is at the top. Each request shows the machine, its address and when its code expires, with
    the code box, **Approve** and **Deny** in place.
  - **Needs you** comes next: a site that needs upgrading, one not connected with work waiting, one whose Docker is
    not running or whose disk is nearly full, and a removed site that still has projects on it.
  - **Running** and **Never connected** follow. **Removed** is folded at the foot, each saying who removed it or that
    it left, and when.
- **Each row is two lines:** the site and its state, then what it holds and what waits. A site that is not connected
  says **since when**, and what waits for it: runs, and changes to reach it. A site that needs upgrading names its
  version, the one HQ needs, and the projects it stops.
- **Each site has its own page.**
  - **On it:** its projects, workspaces and people's files.
  - **Now:** what is running, and changes waiting to reach it.
  - **Health:** runs now against the most it takes at once, disk free, and whether Docker is running with the
    agent image ready.
  - **About it:** its versions, when and by whom it was approved, and its credential, with **Replace**.
  - **Remove**, saying which projects it stops. Check connection is in its header.
  - HQ's own site cannot be removed or have its credential replaced.
- **Notifications.** Organisation admins get **persistent notifications** ([Notifications and Runs](notifications-runs.md)) for:
  - a machine asking to connect, with several requests shown as one;
  - a site that needs upgrading;
  - a site not connected while a run or a change waits on it;
  - HQ's own site not running;
  - a site whose Docker is not running or whose disk is nearly full.

  Each clears itself when the problem is fixed. When a request's code expires, its notification stays and says so,
  until someone dismisses it or the machine asks again.
- **Requests to connect are limited:** a cap on how many may wait at once, in total and per address.
- **Later, with host management:** these pages and notifications move to the infrastructure's own admins.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Execution Sites by what needs an admin** | The list grouped as asking to connect, needs you, running, never connected and removed; a site not connected says since when and what waits for it; each site has its own page with what is on it, what runs now, what waits, its versions and credential, and Remove; the built-in site is named HQ. Today it is one card per site with three buttons on every row |
| **Approving a site from the list, and limits on requests** | A machine's request to connect shows at the top of the list with Approve and Deny; requests that may wait at once are capped, in total and per address. Today requests show only on Connect a site, and are not limited |
| **A site's health** | A site reports runs now and the most it takes at once, disk free, and whether Docker is running with the agent image ready (a protocol change); Docker down or a nearly full disk raises a notification. Today a site reports only its name, protocol version and start time |
