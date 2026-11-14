# host — the host service and its CLI

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `host/`.

The host service is the one authority over a machine (ADR-0107): it installs, starts, stops and — as the rest of
host management lands — upgrades, backs up, restores and erases hq and the site on that machine. It runs as the
container `agenthix-host`, with the machine's Docker socket, a state folder mounted at `/state` and the figures volume.
Its CLI is the same image's command, run with `docker exec -it agenthix-host agenthix …`. It is started with:

```sh
docker run -d --name agenthix-host --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock -v ~/.agenthix:/state \
  -v agenthix-host-figures:/run/host-figures -e TZ=Europe/London \
  --network host --cap-add NET_ADMIN \
  --label com.docker.compose.project=agenthix-host <host service image>
```

**Its version is the reference it was started from**, never built in (`src/images/ownVersion.ts`): at start, before
anything serves, it reads its own container's image reference; a trusted publisher's host image by a published
version's tag (`…/agenthix-host:0.3.0`, with or without `@sha256:…`) is that version once that version's signature
passes and the image it runs is the one signed, and a failed check stops it with what to do. Anything else — a local
build's name, a bare digest — is `dev`, a development build, the only kind that runs images built on the machine.
The image that passed is recorded by its id (`launcher/image.json`), so a start without network trusts the same
content again; the launcher reads its own version there, and the CLI asks the service (`host.version`). It writes the
version into hq-server's and the site's environment (`APP_VERSION`) and the Fleet Console's (`CONSOLE_VERSION`), and
nothing for a development build.

A second host service under a namespace of its own (`INSTALL_NAMESPACE`) is for testing only; [`docs/architecture/ports.md`](../docs/architecture/ports.md) says how installations share a machine's ports and address blocks.

The label puts the host service, its launcher and each new version in one group in Docker Desktop (`<namespace>-host`); the launcher carries it over.

`TZ` is the machine's own time zone (`timedatectl show -p Timezone --value` on Linux), since the nightly backups,
the maintenance window and every scheduled change run in the container's time; without it they run in UTC. A window
Agenthix Cloud sets carries its own time zone instead (`upgrades/zoned.ts`).

Start-up settings beyond these come from a file (`--env-file /etc/agenthix/host.env`), read once at start
(`src/config.ts`): `REGISTRY_USERNAME` and `REGISTRY_TOKEN` for a staging machine's private image
pulls (`src/images/registryAuth.ts`; the credential reaches only the pull, the signature check and the host service's
own reading of the published versions, never another command or container), and, on a machine Agenthix Cloud runs, `CLOUD_URL`, `CLOUD_MACHINE_ID` and
`CLOUD_ENROLMENT_CODE_FILE`. The code file's folder must be mounted writable, because the host service
deletes the file once the code is spent; the code is never logged. On such a machine hq is told so when its services are written (`HQ_RUN_BY_CLOUD`, with
`CLOUD_URL` so it answers to the same Cloud; `compose/projects.ts`).

The volume's name is `<namespace>-host-figures`, and the namespace is the one in the installation's record (`agenthix` unless `INSTALL_NAMESPACE` said otherwise at the host service's first start). Docker
makes the volume on first run; the site's compose project mounts it read-only and declares it `external`, so
compose never creates or removes it. Without it the service starts and warns, and install refuses in words.

`--network host --cap-add NET_ADMIN` is what the agent protections need (spec §8, `src/protections/`), and nothing
more: sharing the machine's network makes the firewall the host service changes the machine's own — on Docker
Desktop, the virtual machine's, where the containers run — and `NET_ADMIN` lets it change it. No `--privileged`.
The rules are an nftables table of their own (`<namespace>_agents`), applied with the image's `nft` at start and
checked every minute; they have no setting. The image must carry `nft` (Alpine's `nftables`).

## Moving to a new version of itself

A container cannot replace itself, so the host service's image carries a **launcher** (ADR-0118, `src/launcher/`):
its second entry point, `node /app/dist/launcher.js`. The host service records the settings its container runs
with — read from Docker's `inspect` of itself, never from a request — in `launcher/container.json` in the state
folder; only those settings carry over (mounts, network, capabilities, the environment `docker run -e` set, and the
restart policy). To switch, it checks the new image's signature, fetches it by digest, writes the switch down in
`launcher/switch.json`, and starts the launcher from its own image as the container `<namespace>-host-launcher`, with only the
Docker socket and the state folder. The launcher runs only that image, only forward: it stops the old container and
keeps it as `<namespace>-host-previous`, starts the new one as `<namespace>-host` with the recorded settings, by `<image>:<version>@<digest>` so it reads its version, and removes the old one once
the new one answers on its owner socket as its version (`launcher.js answer`, run inside it — a command every
version keeps); if it does not within 3 minutes, it removes the new one and starts the old one again. Each step is
written down first, and Docker restarts the launcher with the machine until it has ended, so it carries on from
where it stopped. `agenthix upgrades host --launcher off` turns it off; the CLI then prints the two commands that do
the same by hand.

**A development build switches to another image built on the machine** (`agenthix upgrades host --image <name or
id>`, `src/upgrades/builtHostService.ts`, `src/launcher/built.ts`), so the whole switch and the put-back can be run on a
dev machine. It skips what only a published version has — the signature and "only forward" — and is otherwise the same
switch: the journal marks it `built`, and the launcher starts the new one by the image's id and checks that it runs
that image and answers `dev`. Each side refuses it on a published host service, and refuses a published image (by its
name or its registry digests); a development build is never switched to a published version this way.

The launcher's other mode is `agenthix uninstall`'s last step (`src/launcher/uninstall.ts`), run as
`<namespace>-host-uninstall`: once the host service has removed everything else, it removes the host service's own
container and empties its state folder of what it wrote, leaving a folder that holds anything else whole. It is given
the state folder alone, never its parent, so the empty folder is left for the person (`rmdir`). A new file or
folder the host service writes at the top of its state folder is added to the uninstall's list, or
`stateEntries.test.ts` fails.

## Its Fleet Console, and the link to HQ

The host service has its own keys (`src/identity/`), made once in `identity/keys.json` and never replaced. A machine
joins a Fleet Console with `agenthix console connect <hq address> <code>` (`src/link/join.ts`, `manage.ts`): HQ is
shown only the lookup derived from the code, and the Fleet Console's identity is pinned (`link/console.json`) only
when its binding proves it holds the same code. From then on one outward WebSocket to HQ's `/host-link`, opened
with the machine credential, carries envelopes (`src/link/link.ts`). Disconnecting — `console disconnect`, or HQ's
`revoke` — deletes the pin first, so the very next envelope is refused.

On HQ's machine, `install` also starts the Fleet Console (`src/install/console.ts`, `src/compose/console.ts`),
admitted to HQ by `HQ_CONSOLE_PAIRING_SECRET`, set on hq-server too. Like hq-web, it runs on a Docker network —
its own, `<namespace>-console`, which nothing else joins — and Docker publishes its port to the machine's
127.0.0.1 only, on the port its installation chose (7801 by default, `agenthix console port` changes it; [`docs/architecture/ports.md`](../docs/architecture/ports.md)), so on Docker Desktop the computer's browser opens it too. It listens on its address on that
network and accepts only that network's gateway, through which Docker forwards the published port
(`CONSOLE_LISTEN_HOST=container`, `console/AGENTS.md`). On HQ's machine it also joins HQ's link network, to dial
hq-web by its container name as the default site does, and never answers there; its own network's name sorts
before the link network's, because Docker routes a container out through the first of its networks by name. Never
give it `network_mode: host`, another published address, or another container on its network. The one exception is a
machine Agenthix Cloud runs: while Cloud has remote access on, the host service publishes one more port, where the
Fleet Console ends TLS itself and answers only the addresses Cloud allows (`src/remoteAccess/`, ADR-0132). The host service
joins it like any machine, with a code it gets from the Fleet Console's own command line inside its container
(`src/link/localConsole.ts`). Its state volume is backed up with the site.

**The Fleet Console moves; a machine follows only a handover certificate signed by the Fleet Console it pins, and the
code never reaches hq.** `agenthix hq console-code` on hq's machine gets a handover code from the running Fleet
Console: through `docker exec` into its container when it runs here (`src/link/consoleMove.ts`), or, when it runs on
another machine, in an envelope this host service signs and seals to the Fleet Console it pins, which answers with
the code sealed back to this machine alone (`src/link/askCode.ts`). Only when none runs here and this machine answers
none elsewhere does hq make the code itself, and the new one then starts with no machines; nothing falls back to
that when the running one does not answer.
HQ hands every certificate it holds to a machine as it connects, and when a move completes; `src/link/handover.ts`
moves the pin only on one the pinned Fleet Console signed. On hq's machine, when the Fleet Console that handed over is
the one that ran here, the one-minute loop (`localConsole.ts`) removes it — `compose down --volumes`, so its keys go
too — and `agenthix status` says where it runs now.

## Moves: a site, and hq, to a new machine; hq to a new address

- **A site's move** is `src/move/` (`send.ts` on the old machine, `receive.ts` on the new one). The sealed backup
  goes in chunks each signed by the old machine, checked only against the identity the Fleet Console named in its
  signed `move` request; hq passes them and can neither read nor alter them. Each side writes its phase down before
  every step the other may act on (`move/send.json`, `move/receive.json`), and the deadlines in `timings.ts` keep the
  site from ever running on both machines.
- **hq's move to a new machine** is the same transfer with hq, its default site and a Fleet Console beside them
  (`hqSend.ts`, `hqReceive.ts`, `restoreHq.ts`). hq is read-only from the moment the backup starts (its control
  socket's `read-only`); the old machine stops hq as it sends the release, and the new one starts hq only once that
  stop has had time to happen. The steps after that cross hq on the new machine (`transfer-open`), and the old
  machine's link dials hq's new address. A Fleet Console that ran beside hq starts on the new machine only once the
  old one has committed. The copy left behind goes only on the Fleet Console's `remove` (target `hq`) after the
  commit.
  hq holds read-only in memory, so until the move ends on each machine the host service says `read-only on` again
  every few seconds (`keepReadOnly`, `hqSteps.ts`): an hq that starts anew mid-move is read-only again at once.
- **`hq move recover`** (`hqRecover.ts`) is the way back when a move of hq ended on neither machine: the old machine
  committed, but the new one never heard it and gave hq back. On the old machine it starts hq from what was kept,
  and records the move as not completed, only with the person's confirmation that the new machine does not run hq.
  It is refused before the new machine's deadline, while the old machine's link reaches hq at its new address, and
  once the copy was removed.
- **hq's new address** is told to sites, machines and the Fleet Console over the connection each already has; each
  switches only once the new address passes the move check (`src/link/addressFollow.ts`, `install/hqAddress.ts`).
- **`hq console-code --no-machines`** is the way back when the Fleet Console ran elsewhere and that machine is lost:
  hq makes the code, this machine leaves its pin, and every machine connects again with `console connect` — hq's
  machine too, which is then allowed to. Never the default, and refused without the person's confirmation. hq's
  machine's join says "this machine runs HQ" under its binding (`runsHq`), set only when this host service runs hq
  and it has not moved away, so the new Fleet Console can mark it as hq's machine once a fleet admin confirms.

## A plain Node server, like the site

No Wasp and no framework (ADR-0086's reasons apply): Node's own modules, the `docker` CLI with its compose
plugin, `@agenthix/core`, and `@aws-sdk/client-s3` for a backup location Cloud sets, all bundled. Nothing here imports from `hq/` or `site/`.

- `src/main.ts` is the service: it makes the state folder private, records the installation (`src/state/installation.ts`: namespace, ports, agent slice), and opens both sockets.
- `src/launcher/main.ts` is the launcher, the image's second entry point (above).
- `src/cli/main.ts` is the CLI. `src/cli/commands.ts` is its command table, which `help` lists: a new command is
  a row there. The words a person reads are in `src/cli/` (`messages.ts`, `statusText.ts`); HQ is in capitals
  there, and the product's and command's names come from core's branding module.
- `npm run build` bundles the three to `dist/` with esbuild and writes the CLI's command to `dist/bin/`, named from
  the branding module. `npm run typecheck` needs nothing generated first.
- The image is `docker/Dockerfile`, built natively from the repository root with only Docker (ADR-0069).

## Rules that keep the machine's authority closed

- **Two sockets, and nothing else listens.** The owner socket (`/run/host/owner.sock`, inside the container
  only) takes every operation; the figures socket (`/run/host-figures/figures.sock`, in the figures volume, which
  the site mounts read-only) answers `figures.read` and nothing else. Not in the state folder: a Unix socket in a
  bind-mounted folder does not work on Docker Desktop.
- **Every request goes through `parseOwnerRequest`** (`src/owner/requests.ts`), which takes core's closed set
  (`parseHostRequest`) and the few operations that stay on the machine. A new operation is added there
  deliberately and rebuilt field by field; nothing is ever passed through to Docker, a shell or a file.
- **A controller asks through `src/link/envelopes.ts` only**: an envelope opened against the one pinned Fleet
  Console (nothing else), naming a fleet admin, and its request taken by core's
  `parseHostRequest` alone — never `parseOwnerRequest` — so none of the owner socket's machine-only operations can
  be asked that way. Then `src/owner/controller.ts`, the same dispatch as the CLI's requests of the closed set.
- **Agenthix Cloud's controller asks through `src/cloud/` only**, on a machine enrolled with Cloud: its own link
  (`cloud/link.ts`, never through hq), envelopes opened against the one pinned Cloud identity (`cloud/envelopes.ts`),
  shared operations through `parseHostRequest`, and the Cloud-only operations of `core/src/host/cloudOperations.ts`
  through the registry in `cloud/handlers.ts` — one entry per operation, each parsing its own fields. A Cloud-only
  operation is refused from the Fleet Console, the CLI, and on any machine not enrolled. A machine set up for Cloud
  (`CLOUD_URL`) refuses a Fleet Console's join and pin: one controller per machine. A front door
  certificate (`frontDoor/set.ts`) is accepted from Cloud alone, as is Cloud's backup location (S3-compatible,
  `backups/cloudLocation.ts`, with its S3 client bundled), which no folder location can then replace; the
  operations that reach hq (`site.*`, `account.*`, `organisation.*`) go over hq's control socket (`cloud/hqOperations.ts`) and never
  log a link. Remote access Cloud turns on is `src/remoteAccess/` (ADR-0132).
- **Docker is driven only by `src/docker/`** (`docker.ts`, and `containers.ts` for its own container and the
  launcher), with argument lists the host service builds itself, never through a shell.
- **Every stored name derives from the recorded namespace** (`src/state/namespace.ts`): compose projects,
  containers, networks, volumes, labels and database names. Never write the product's name into one; image
  names come from core's `imageName`.
- **Everything written to the state folder is readable by its owner only** (`src/state/folder.ts`), and no
  secret is ever printed or logged.

## Testing

`npm test` runs the unit tests with Docker stood in by a fake (`src/__tests__/fakeMachine.ts`). Tests that need a
real Docker and the built image are `*.container.test.ts`, run with `npm run test:container` after
`docker build -f host/docker/Dockerfile -t agenthix-host .` at the repository root.

Each container test runs under a namespace of its own (`hte<tag><pid>`, `testNamespace`), recorded in the state folder
of any host service it starts, and every Docker command it runs goes through a guard
(`src/__tests__/containerGuard.ts`) that refuses, before running it, one that would create, stop, enter or remove
anything whose name does not carry that namespace, so a machine's real install is out of a test's reach. A test
runs beside an installed copy: it holds no fixed port, but chooses free ones (`freePorts`) and passes them to the
install as `--hq-port` and `--console-port`, and the networks it creates are in the tests' own address block. The ports and
address blocks are in [`docs/architecture/ports.md`](../docs/architecture/ports.md).
