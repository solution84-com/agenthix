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
checks (the agent container image) and the network modes below, and starts hq's relay beside it.

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

AI providers after a wipe: copy `.env.dev.example` to `.env.dev` at the repository root and fill in the keys you have.
`start.sh` (so `fresh.sh` too) adds each one hq does not have yet once hq is up, through its control socket, and logs
a line per provider added or refused. Leave a key blank to add that provider by hand, in setup for example.

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

## hq's relay

The relay ([adr-0153](../../../docs/adr/adr-0153-relays-carry-every-file-byte-and-hq-only-signs-tickets.md)) carries the
bytes of every file a browser opens: a site's, from the site that holds it, and hq's own uploads (task attachments and
pictures), which it reads from hq's storage folder. In development it is a process on port 4401 beside
hq, started by `hq/scripts/dev/start.sh` (so by `[dev] Start All`) through `scripts/dev/relay.sh`, which builds it and
runs it on this machine only; it stops when hq's script ends. To run it alone: `bash scripts/dev/relay.sh`. If its
port is taken it says so and hq starts without it.

It shares a second secret with hq, `HQ_RELAY_SECRET` (at least 32 characters), in `hq/.env.server` and
`relay/.env.server`, made and kept equal by `scripts/dev/pair.sh`; it dials hq-server at `localhost:4101` and reads
hq's address (and the files address, when `hq/.env.server` has one) from `hq/.env.server`. hq's dev server sends it a
ticket's path (`/t/…`) and the line sites dial (`/relay-line`, a WebSocket), and keeps the `Host` header when it
does: the relay answers a `/t/…` ticket only on the files address, which is `files.localhost:4100` while hq is on
`localhost`. The same path on `localhost:4100` is refused by design. On `localhost:4100` itself a ticket is opened
under the bare prefix, `/relay/t/…`, which the dev server also sends to the relay, and every answer there is a
download.

The relay reads hq's uploads from hq's storage folder (`HQ_UPLOADS_ROOT`): `scripts/dev/relay.sh` takes it from
`HQ_STORAGE_ROOT` in the environment or `hq/.env.server`, and otherwise uses `hq/storage`, hq's own fallback. If hq
runs with another `HQ_STORAGE_ROOT` than the relay sees, pictures and attachments do not open. In the installed
compose set the same volume is mounted read-only into the relay.

In development the site dials hq-server (`localhost:4101`), which has no `/relay-line`, so `pair.sh` also writes
`HQ_RELAY_LINE_URL=ws://localhost:4401/relay-line` into `hq/.env.server`: hq gives that address to sites as hq's relay's
line, in place of the path. It is for development only. An invalid value is ignored, with a warning in hq's log at start. Without the relay, files cannot be opened; everything else works.

## On a machine that also has an install

**A development site cannot be reached by its own agents on a machine where an install's host service runs.** The
install's agent protections put a firewall table on the machine (nftables, `<namespace>_agents`, so
`agenthix_agents`; `host/src/protections/rules.ts`) that drops everything sent from the install's own slice of the agents' address block
(a `/20` of `10.213.0.0/16`), to the machine's own addresses — on Docker Desktop, to the computer Docker runs on too. The
development site runs on the machine itself and its agents reach it at `host.docker.internal:4201`, from that same
slice when it has no range of its own, so every call an agent makes to the site is dropped: its platform tools and git credentials fail. The
host service puts the table back within a minute if it is removed, so removing it is no fix.

To develop beside an install, give the development site's agents a range of their own: set
`AGENT_NETWORK_RANGE=10.212.0.0/16` in `site/.env.server` (any IPv4 range outside the agents' `10.213.0.0/16` and the
install's own `10.214.0.0/16` that no network of yours uses) and restart the site. The install's rules match only
their own range, so they leave the development site's agents alone, and the install's agents stay protected. The
other way is to develop on a machine with no install.

## A test installation beside an install

Every port and address block is in [`docs/architecture/ports.md`](../../../docs/architecture/ports.md).

A second installation on the same machine is for testing only: supported installs stay one HQ and one site per
machine ([ADR-0108](../../../docs/adr/adr-0108-a-machine-carries-at-most-one-hq-and-one-site.md)), and the user
guide shows only that. A test installation is another host service with its own namespace and state folder, started
with `INSTALL_NAMESPACE`; its container must be named `<namespace>-host`, or its first start refuses. It publishes
only ports it is given, picked free and checked against the other installation's, and takes its own slice of the
agents' address block. The mobile app's test HQ is the example (use a version you have, and a free port for each):

```sh
docker run -d --name mobiletest-host --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock -v ~/.agenthix-mobiletest:/state \
  -v mobiletest-host-figures:/run/host-figures -e INSTALL_NAMESPACE=mobiletest \
  --network host --cap-add NET_ADMIN \
  --label com.docker.compose.project=mobiletest-host ghcr.io/solution84-com/agenthix-host:<version>
docker exec -it mobiletest-host agenthix install --address http://<machine's address>:7500 --console-port 7520
```

The address's port is HQ's (`--hq-port` says the same). Everything it runs is named `mobiletest-…`; its commands are
run with `docker exec … mobiletest-host agenthix …`, and `agenthix uninstall` inside it removes it. The install test
(`scripts/install-test/run.sh`) and the host container tests (`npm run test:container` in `host/`) are started the
same way, each under a namespace of its own and on free ports, so they run beside an install. If the machine's own
install is the one that must keep running, never run these commands as it: use the namespace's host container.

## GitHub in development

Register a dev hq's GitHub App on a GitHub organisation kept for testing, never one that holds live work: connecting a
workspace creates a repository there, and the starter workflows push to it. The same goes for anything else that
creates repositories, such as a test or a walkthrough.

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
