---
name: running-locally
description: Use when starting, stopping or reaching the development servers of this repository — hq and its site, the dev databases, pairing hq with its site, reaching hq from another device over Tailscale or the local network, or registering a further site. Also use when hq reports that an Execution Site is unreachable during development.
---

# Running Agenthix locally

## Start

```bash
docker compose up -d                # dev databases: hq on 4109, site on 4209
cd hq   && npx wasp start           # client 4100, server 4101
cd site && npm install && npm run db:deploy && npm run dev   # server 4201
```

In VS Code, **Run Task → `[dev] Start All`** does all of it. `hq/scripts/dev/start.sh` starts hq with extra
checks (the agent container image) and the network modes below.

hq needs Node.js 24.14.1 or later. Its Wasp CLI is pinned as a dev dependency (`@wasp.sh/wasp-cli`), so Wasp
runs as `npx wasp` from `hq/`; a global `wasp` of another version is never used. On a fresh clone, run
`npm install && npx wasp install` in `hq/` once first. The Wasp CLI sends usage telemetry unless
`WASP_TELEMETRY_DISABLE=1` is set in your environment; hq's images set it.

Before the first run, copy the env templates: `hq/.env.server.example` → `hq/.env.server`,
`hq/.env.client.example` → `hq/.env.client`, `site/.env.server.example` → `site/.env.server`.

The site is a plain Node server ([ADR-0086](../../../docs/adr/adr-0086-the-execution-site-is-a-plain-node-server.md)):
`npm install` also generates its Prisma client, `npm run db:deploy` applies its migrations, and `npm run dev`
runs it from source and restarts it on save. It has one port and no web client.

A fresh HQ without Docker: stop the normal dev apps, then `hq/scripts/dev/fresh.sh` starts hq and its site against
separate empty databases (`agenthix_fresh`, `agenthix_site_fresh` on the dev database containers), created and migrated if missing,
without touching `.env.server` or the normal databases. hq's log prints the first-admin link ("No admin yet. Open this link…"), an `/invite/<key>` address that opens setup at `/setup`.
`fresh.sh --reset` recreates both databases to run the first-admin flow again; `--dry-run` prints what it would do. It refuses to run while ports 4100/4101 are in use.

## hq and its own site come as a pair

Workspace and repository-attachment rows live in the site's database, and hq reads them over the control
channel, so the storage pages, session locations and agent mounts all need the site running and connected.
With the site down, workspace features fail with an explicit "Execution Site … is unreachable" error — the
designed behaviour, not a fault.

The site that comes with hq connects by configuration, not registration
([ADR-0070](../../../docs/adr/adr-0070-hq-and-its-own-site-are-connected-by-configuration.md)): one secret,
`HQ_PAIRING_SECRET`, in both `hq/.env.server` and `site/.env.server`, written by `scripts/dev/pair.sh` at the repository root (which
`[dev] Start All` and `hq/scripts/dev/start.sh` run). hq creates a default organisation and the default site at
first boot, so there is nothing to register or approve. `npm run site -- status` from `site/` shows the link.

## On a machine that also has an install

**A development site cannot be reached by its own agents on a machine where an install's host service runs.** The
install's agent protections put a firewall table on the machine (nftables, `<namespace>_agents`, so
`agenthix_agents`; `host/src/protections/rules.ts`) that drops everything sent from the agents' address range,
`10.213.0.0/16`, to the machine's own addresses — on Docker Desktop, to the computer Docker runs on too. The
development site runs on the machine itself and its agents reach it at `host.docker.internal:4201`, from that same
range, so every call an agent makes to the site is dropped: its platform tools and git credentials fail. The
host service puts the table back within a minute if it is removed, so removing it is no fix.

To develop beside an install, give the development site's agents a range of their own: set
`AGENT_NETWORK_RANGE=10.212.0.0/16` in `site/.env.server` (any IPv4 range outside the agents' `10.213.0.0/16` and the
install's own `10.214.0.0/16` that no network of yours uses) and restart the site. The install's rules match only
their own range, so they leave the development site's agents alone, and the install's agents stay protected. The
other way is to develop on a machine with no install.

## A further site

A further site registers with an admin's consent (ADR-0064): from that site's `site/`,
`npm run site -- register <hq-url>` prints a code that an admin approves at **Execution Sites → Connect a site**
in hq. The site has no operator page (ADR-0065).

## Reaching hq from another device

- **Tailscale (tailnet only):** `hq/scripts/dev/start.sh --tailnet` puts tailnet-only HTTPS in front of hq with
  `tailscale serve` (never `funnel`) — the page at `https://<machine>.<tailnet>.ts.net:4443`, the server at
  `:4444` — writes those addresses into hq's env files, and binds both dev servers to `127.0.0.1`, so nothing is
  reachable from the local network. The site needs no change: it keeps dialling hq at `localhost`. Run
  `start.sh` without the flag to go back to `localhost`, and `tailscale serve --https=4443 off` (and `4444`) to
  remove the entries.
- **Local network:** `start.sh --lan` (or `--lan-ip <ip>`) writes the machine's `.local` name into the env files,
  for testing from a phone on the same Wi-Fi. OAuth redirect addresses must be registered for that name.

## Deployed images

The real container images, not the development servers, are described in
[the deployment guide](../../../docs/architecture/deployment.md).
