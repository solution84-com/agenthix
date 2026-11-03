---
name: Domain map — host
description: Feature-domain carving of the host module (the host service and its CLI) for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Drawn 2026-11-03 from the source tree (about 235 source files). Update only when the operation set or the folder layout changes.
updated: 2026-11-03
---

# Domain map — `host/`

20 domains. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness.

The host service is a plain Node server with no framework and no operation list file like hq's `main.wasp.ts`. Its operations are of four kinds, and the **Ops** lines below use these names:

- **CLI commands** — what a person types (`agenthix …`, the table is `src/cli/commands.ts`). Each becomes a request on the owner socket.
- **Owner-socket operations** — the `op` names that `parseOwnerRequest` (`src/owner/requests.ts`) accepts: core's closed set (`parseHostRequest`) plus the few operations that stay on the machine.
- **Controller operations** — the same closed set, asked by a fleet admin through the Fleet Console in a signed envelope (`src/link/envelopes.ts`). Never the machine-only operations.
- **Cloud-only operations** — core's `cloudOperations.ts`, asked by Agenthix Cloud's controller on its own link (`src/cloud/`), each with a handler in `src/cloud/handlers.ts`.
- **Background jobs** — timers started in `src/main.ts` (the one-minute loops, nightly backups, the scheduler, automatic upgrades, the firewall check, the bin purge).

**Ownership is by concern**: a file belongs to the domain whose behaviour it carries. A CLI file belongs to the domain of the command it parses and words, not to a general CLI domain; `src/cli/` files that serve every command are in domain 3. The owner-socket `switch` in `src/owner/dispatch.ts` is in domain 2 and only routes; the work each case does is in the domain named in its Ops.

**Security-sensitive concerns, and where each lives:**

| Concern | Domain |
|---|---|
| The owner socket as the only door, and `parseOwnerRequest` refusing anything unknown | 2 |
| Signature check and replay guard on a Fleet Console's envelope; the single pinned identity; fleet-admin naming | 11 |
| Signature check on Cloud's envelope; the one-controller-per-machine rule | 18 |
| Image signature check (cosign) and a trusted publisher's reference | 5 |
| The host service's own version taken from its image reference | 5 |
| Docker socket use, argument lists built without a shell, namespace-derived names | 4 |
| State folder readable by its owner only; secrets on disk; the host service's keys | 1 |
| Backup sealing and key handling; the S3 location Cloud sets | 8 |
| A site's or hq's move: chunks signed by the old machine, phases written down | 14 |
| The launcher running as a second container with the Docker socket | 6 |
| Firewall rules, `NET_ADMIN`, running with the machine's network | 17 |
| The image: user it runs as, what it carries, registry credentials | 20 and 5 |

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Service start-up, state & identity | the service process, state folder, installation record, host keys | `main.ts`, configuration, the context every operation gets, the state folder and its permissions, namespace-derived names, secrets, the host service's identity keys |
| 2 | Owner socket & request gate | OwnerRequest | the one door: the line server, `parseOwnerRequest`, the dispatch from an operation to its work, results and refusals, the controller entry |
| 3 | CLI shell | Command | the CLI's entry point, command table, help, argument helpers, the way a request is sent and its answer printed |
| 4 | Docker control & compose projects | Docker, compose project | the `docker` CLI wrapper, containers, removal, compose files for hq, the site and the Fleet Console, networks and subnets |
| 5 | Image trust & versions | image reference, signature, own version | which images are trusted, signature verification, registry credentials, the host service's version, published versions |
| 6 | Host service self-switch & launcher | launcher, switch journal | moving the host service to a new version of itself (and a built image on a development machine), the launcher's swap, put-back and record |
| 7 | Install & ports | Installation, port choice | `install`, the address check, port choice and checks, the managed site, the site's compose project, hq's own commands for first admin |
| 8 | Backups | Backup, backup location, backup key | taking, sealing, storing, listing and scheduling backups, backup locations (folder, S3), key handling, renewal |
| 9 | Restore & export | Restore, export | restoring hq or a site from a backup, exports and their download, scheduled restore, restoring a site in place |
| 10 | Upgrades | Upgrade, upgrade settings | upgrading hq and the site, health check and rollback, automatic fixes and their window, versions, upgrade status |
| 11 | Fleet Console connection & signed commands | Pin, envelope, link | joining and leaving a Fleet Console, the pinned identity, the outward link to hq, the signed-command API a controller calls |
| 12 | Fleet Console on this machine & hand-over | local Fleet Console, handover certificate | installing, removing and re-porting the Fleet Console, its codes, handover to a Fleet Console that moved |
| 13 | HQ's address | hq address | telling the site, machines and the Fleet Console where hq moved, and each following only once the new address passes the move check |
| 14 | Moves (site and hq to a new machine) | Move | the signed, chunked transfer of a site or hq to another machine, its phases and deadlines, recovering hq after a failed move |
| 15 | Lifecycle & capacity | Lifecycle change, bin, capacity | start, stop, suspend, resume, erase and the bin, restoring an erased part, capacity figures |
| 16 | Uninstall | Uninstall plan | removing everything the host service made, then the host service itself through the launcher |
| 17 | Agent protections | firewall table | the nftables rules for agent containers, their check each minute, public address records |
| 18 | Agenthix Cloud link & remote access | Cloud enrolment, Cloud operations | enrolling with Cloud, its link and envelopes, the Cloud-only operations, remote access to the Fleet Console |
| 19 | Status, figures, logs, front door & previews | machine status, figures, front door, previews | what `status` reports, figures for the site, logs, the HTTPS front door, previews, scheduled changes |
| 20 | Build & image | Dockerfile, bundles | the host image, the bundling script, bundle checks, package and compiler configuration |

---

## Domain scopes (files + operations)

### 1. Service start-up, state & identity
- **Files:** `src/main.ts`; `src/config.ts`; `src/service/context.ts`; `src/state/folder.ts`; `src/state/installation.ts`; `src/state/namespace.ts`; `src/state/secrets.ts`; `src/identity/identity.ts`
- **Ops:** the service's start (makes the state folder private, records the installation, opens both sockets, starts the background jobs, shuts down); background jobs as started in `main.ts`: the relay timer, and the starters of domains 8, 10, 11, 15, 17, 18, 19
- **Note:** The state folder and secrets on disk (`folder.ts`, `secrets.ts`) and the host service's keys (`identity.ts`) are here. `installation.ts` holds the namespace, ports and agent slice; every stored name derives from `namespace.ts`.

### 2. Owner socket & request gate
- **Files:** `src/sockets/lineServer.ts`; `src/owner/requests.ts`; `src/owner/dispatch.ts`; `src/owner/results.ts`; `src/owner/controller.ts`
- **Ops:** the owner-socket line protocol; `parseOwnerRequest` (every operation name it accepts, closed set plus machine-only); the dispatch switch in `dispatch.ts` (`figures.read`, `logs.read`, `install`, `start`, `stop`, `address.set` and all the others, each routed to its domain); `controllerOperation` (the controller entry that applies the closed set and names the fleet admin)
- **Note:** This domain checks the gate and the routing: that nothing outside `parseOwnerRequest` is reachable, that a controller reaches only the closed set, and that a refusal reaches the caller in words. The work behind each case is audited in the domain that owns it. The figures socket is in domain 19.

### 3. CLI shell
- **Files:** `src/cli/main.ts`; `src/cli/run.ts`; `src/cli/commands.ts`; `src/cli/messages.ts`; `src/cli/words.ts`; `src/cli/portOptions.ts`
- **Ops:** `agenthix help`, `agenthix help <topic>`, the "no such command" answer; the command table and argument helpers (`option`, `flag`); how each command is turned into a request and its answer printed
- **Note:** The commands themselves are in the domain of their feature: `install` and `restore`, `status`, `logs`, `front-door`, `backup`, `upgrade`, `schedule`, `capacity`, `console`, `hq`, `site`, `cloud`, `provider`, `uninstall`, and the lifecycle verbs. `portOptions.ts` parses `--hq-port` and `--console-port` and is audited here; the port rules are domain 7.

### 4. Docker control & compose projects
- **Files:** `src/docker/docker.ts`; `src/docker/containers.ts`; `src/docker/machineContainers.ts`; `src/docker/publishProbe.ts`; `src/docker/removal.ts`; `src/compose/agentSlice.ts`; `src/compose/console.ts`; `src/compose/projects.ts`; `src/compose/subnets.ts`
- **Ops:** none asked directly; used by every domain. Docker operations: compose up, down (with and without volumes), logs, inspect, exec, network and volume handling, the host service's own container inspect, publish probe
- **Note:** The only place Docker is driven, with argument lists built by the host service and never through a shell. The Docker socket is used here. `compose/projects.ts` writes the services for hq, the site and the environment each receives (`APP_VERSION`, `HQ_RUN_BY_CLOUD`, `HQ_CONSOLE_PAIRING_SECRET`). `compose/console.ts` is the Fleet Console's compose project and its network rule (127.0.0.1 only, no host network).

### 5. Image trust & versions
- **Files:** `src/images/images.ts`; `src/images/ownVersion.ts`; `src/images/published.ts`; `src/images/registryAuth.ts`; `src/images/signatures.ts`
- **Ops:** none asked directly. Start-up check of the service's own image against a trusted publisher; signature check (cosign) for any image fetched; pull with a registry credential; reading the version of a published image
- **Note:** Signature verification and the rule "anything not a published version is `dev`" live here. `registryAuth.ts` is the one place the registry credential reaches, and only for a pull and a signature check. The image's own build is domain 20.

### 6. Host service self-switch & launcher
- **Files:** `src/launcher/main.ts`; `src/launcher/built.ts`; `src/launcher/journal.ts`; `src/launcher/record.ts`; `src/launcher/start.ts`; `src/launcher/swap.ts`; `src/upgrades/hostService.ts`; `src/upgrades/builtHostService.ts`; `src/cli/builtSwitch.ts`; `src/cli/hostContainer.ts`
- **Ops:** `agenthix upgrades host` (`--launcher off`, `--image <name or id>`, `--yes`); owner-socket `upgrades.hostService`, `upgrades.hostSwitch`, `host.version`; the launcher's entry point (`node /app/dist/launcher.js`) and its `answer` mode; the launcher's swap, wait for the new version, put-back after 3 minutes, resume after a restart
- **Note:** Recording the container's settings from Docker's `inspect` (never from a request), the journal written before each step, and "only forward" for published versions are the points. The uninstall mode of the launcher is domain 16.

### 7. Install & ports
- **Files:** `src/install/install.ts`; `src/install/address.ts`; `src/install/managedSite.ts`; `src/install/portCheck.ts`; `src/install/ports.ts`; `src/install/siteCompose.ts`; `src/hq/control.ts`; `src/owner/providerCliOps.ts`; `src/cli/provider.ts`
- **Ops:** `agenthix install` (`--address`, `--hq-port`, `--console-port`, `--yes`); owner-socket `install`, `machine.install`; `agenthix hq invite-admin`, `agenthix hq reset-password <user>`; `hq.inviteAdmin`, `hq.resetPassword`; `agenthix provider add|list|remove` (`hq.provider`); hq's control socket client (links, read-only, provider commands)
- **Note:** Port choice and address-block rules are from `core/src/ports/ports.ts`. `hq/control.ts` is the client for hq's control socket, also used by domains 14 and 18. The Fleet Console's install is domain 12. A restore on a fresh machine is domain 9.

### 8. Backups
- **Files:** `src/backups/byteReader.ts`; `src/backups/cloudLocation.ts`; `src/backups/cloudLocationHandler.ts`; `src/backups/errors.ts`; `src/backups/io.ts`; `src/backups/keys.ts`; `src/backups/list.ts`; `src/backups/location.ts`; `src/backups/nightly.ts`; `src/backups/operations.ts`; `src/backups/parts.ts`; `src/backups/renewal.ts`; `src/backups/s3Folder.ts`; `src/backups/seal.ts`; `src/backups/status.ts`; `src/backups/store.ts`; `src/backups/take.ts`; `src/cli/backups.ts`; `src/cli/backupWords.ts`
- **Ops:** `agenthix backup now`, `backup export`, `backup location`; owner-socket and controller `backup.take`, `backup.list`, `backup.store`, `backup.fetch`, `backup.status`, `backup.location`, `backup.locationConfirm`, `backup.saveKey`, `backup.exportNow`; Cloud-only `backup.location.set`; background job: nightly backup
- **Note:** Sealing a backup, the backup key and its renewal (`seal.ts`, `keys.ts`, `renewal.ts`) and the S3-compatible location Cloud sets (`cloudLocation.ts`, `s3Folder.ts`) are here. Restoring and exporting are domain 9.

### 9. Restore & export
- **Files:** `src/backups/export.ts`; `src/backups/exportDownload.ts`; `src/backups/joinedRestore.ts`; `src/backups/restore.ts`; `src/backups/restoreSource.ts`; `src/backups/scheduledRestore.ts`; `src/backups/siteInPlace.ts`; `src/backups/siteRestore.ts`; `src/cli/restoreSiteWords.ts`
- **Ops:** `agenthix restore --from <folder or file>` (with `<hq address> <code>` for a site); owner-socket and controller `backup.export`, `backup.exportRead`, `backup.exportDone`, `backup.restore`, `restore.list`, `restore.check`, `restore.run`; background job: sweep of held exports
- **Note:** A held export is a file a controller reads in parts; check its lifetime and who may read it.

### 10. Upgrades
- **Files:** `src/upgrades/automatic.ts`; `src/upgrades/cloudSet.ts`; `src/upgrades/health.ts`; `src/upgrades/operations.ts`; `src/upgrades/rollback.ts`; `src/upgrades/rules.ts`; `src/upgrades/settings.ts`; `src/upgrades/status.ts`; `src/upgrades/unchangedSince.ts`; `src/upgrades/upgrade.ts`; `src/upgrades/versions.ts`; `src/upgrades/zoned.ts`; `src/cli/upgrades.ts`
- **Ops:** `agenthix hq upgrade`, `agenthix site upgrade` (`--at`, `--yes`); `agenthix upgrades` (`--auto`, `--window`); owner-socket and controller `upgrade`, `upgrades.status`, `upgrades.check`, `upgrades.set`; Cloud-only `upgrades.set`; background job: automatic upgrades
- **Note:** `hostService.ts` and `builtHostService.ts` (switching the host service itself) are domain 6.

### 11. Fleet Console connection & signed commands
- **Files:** `src/link/envelopes.ts`; `src/link/frames.ts`; `src/link/join.ts`; `src/link/leaving.ts`; `src/link/link.ts`; `src/link/manage.ts`; `src/link/pin.ts`; `src/link/socket.ts`; `src/link/status.ts`; `src/link/stopping.ts`; `src/owner/consoleOps.ts`; `src/cli/console.ts`; `src/cli/consoleWords.ts`
- **Ops:** `agenthix console connect <hq address> <code>`, `console disconnect`; owner-socket `console.connect`, `console.disconnect`, `hq.fleetAdmin`, and `agenthix hq fleet-admin`; the **signed-command API**: an envelope opened against the pinned Fleet Console, naming a fleet admin, carrying one closed-set request (`parseHostRequest`), answered with a sealed result; the outward WebSocket to hq's `/host-link` opened with the machine credential; `HQ`'s `revoke`; background jobs: the link's reconnect and the leaving notices
- **Note:** The pin is deleted first on disconnect or revoke, so the next envelope is refused. Check the replay guard, the size limit on frames, the signature check and what an envelope may never ask. Hand-over of the pin to a moved Fleet Console is domain 12; a machine set up for Cloud refusing a join is checked here and in domain 18.

### 12. Fleet Console on this machine & hand-over
- **Files:** `src/install/console.ts`; `src/install/consolePort.ts`; `src/link/askCode.ts`; `src/link/consoleMove.ts`; `src/link/handover.ts`; `src/link/localConsole.ts`; `src/cli/consoleRemoveWords.ts`
- **Ops:** `agenthix console install`, `console port`, `console remove`; `agenthix hq console-code` (`--no-machines`); owner-socket `console.install`, `console.port`, `console.remove`, `hq.consoleCode`; the sealed code request to a Fleet Console on another machine; hand-over certificates handed to a machine as it connects; background job: the one-minute loop that keeps the local Fleet Console joined and removes the one that handed over
- **Note:** A machine follows only a certificate signed by the Fleet Console it pins; the code never reaches hq. The Fleet Console's compose project is domain 4.

### 13. HQ's address
- **Files:** `src/install/hqAddress.ts`; `src/install/siteAddress.ts`; `src/link/addressFollow.ts`; `src/link/pointMachine.ts`; `src/cli/hqAddress.ts`; `src/cli/hqAddressWords.ts`
- **Ops:** `agenthix hq address`, `agenthix site hq-address`, `agenthix console hq-address`; owner-socket `address.set`, `console.hqAddress`; hq's new address told over the connection each part already has
- **Note:** Each part switches only once the new address passes the move check.

### 14. Moves (site and hq to a new machine)
- **Files:** `src/move/chunks.ts`; `src/move/code.ts`; `src/move/hqReceive.ts`; `src/move/hqRecover.ts`; `src/move/hqSend.ts`; `src/move/hqSteps.ts`; `src/move/operations.ts`; `src/move/peer.ts`; `src/move/ports.ts`; `src/move/receive.ts`; `src/move/record.ts`; `src/move/report.ts`; `src/move/restoreHq.ts`; `src/move/restoreSite.ts`; `src/move/send.ts`; `src/move/timings.ts`; `src/move/wire.ts`; `src/cli/move.ts`
- **Ops:** `agenthix hq move recover`; `agenthix site schedule move --at`, `agenthix hq schedule move --at`; owner-socket `site.moveCode`, `hq.moveCode`, `hq.moveRecoverCheck`, `hq.moveRecover`; the signed `move` request from the Fleet Console and its chunk exchange between machines; hq's read-only hold during a move (`keepReadOnly`); background job: settling a move after a restart
- **Note:** Chunks signed by the old machine and checked against the identity the Fleet Console named; phases written down before each step the other side may act on; deadlines that stop the site running on two machines.

### 15. Lifecycle & capacity
- **Files:** `src/lifecycle/bin.ts`; `src/lifecycle/changes.ts`; `src/lifecycle/erase.ts`; `src/lifecycle/resize.ts`; `src/lifecycle/siteTold.ts`; `src/lifecycle/status.ts`; `src/lifecycle/suspend.ts`; `src/figures/capacity.ts`; `src/cli/capacity.ts`; `src/cli/lifecycle.ts`; `src/cli/lifecycleWords.ts`
- **Ops:** `agenthix hq|site suspend|resume` (`--at`), `hq erase` (`--on`), `site erase`, `hq|site restore` (the lifecycle verbs; `start` and `stop` are controller operations only); `agenthix capacity`; owner-socket and controller `start`, `stop`, `suspend`, `resume`, `erase`, `capacity.set`, `erased.restore`; Cloud-only `resize.prepare`, `resize.finish`; background job: the bin purge
- **Note:** `erase` moves data to a bin for a time; `bin.ts` purges it. The uninstall steps are domain 16.

### 16. Uninstall
- **Files:** `src/lifecycle/uninstall.ts`; `src/lifecycle/uninstallSteps.ts`; `src/launcher/uninstall.ts`; `src/cli/uninstall.ts`; `src/cli/uninstallWords.ts`
- **Ops:** `agenthix uninstall`; owner-socket `machine.uninstallCheck`, `machine.uninstall`; the launcher's uninstall mode (container `<namespace>-host-uninstall`)
- **Note:** The state folder is emptied of what the host service wrote and the folder itself is left. A new top-level entry in the state folder must be in the list (`stateEntries.test.ts` fails otherwise).

### 17. Agent protections
- **Files:** `src/protections/drops.ts`; `src/protections/firewall.ts`; `src/protections/machine.ts`; `src/protections/protections.ts`; `src/protections/publicAddress.ts`; `src/protections/rules.ts`
- **Ops:** none asked by a person; the nftables table `<namespace>_agents` applied at start with the image's `nft`; the figures it supplies (`protectionFigures`); background job: the check every minute
- **Note:** Runs with `--network host --cap-add NET_ADMIN`. Check the rules are the host service's own and have no setting.

### 18. Agenthix Cloud link & remote access
- **Files:** `src/cloud/codeFile.ts`; `src/cloud/dispatch.ts`; `src/cloud/enrol.ts`; `src/cloud/envelopes.ts`; `src/cloud/handlers.ts`; `src/cloud/hqOperations.ts`; `src/cloud/link.ts`; `src/cloud/start.ts`; `src/link/cloudController.ts`; `src/owner/cloudCliOps.ts`; `src/remoteAccess/consoleRemote.ts`; `src/remoteAccess/handlers.ts`; `src/remoteAccess/publish.ts`; `src/remoteAccess/state.ts`; `src/cli/cloud.ts`
- **Ops:** `agenthix cloud connect|disconnect|reset-code` and `agenthix console remote off`; owner-socket `hq.cloudConnection`, `console.remoteOff`, `console.resetCode`; Cloud-only `account.adminInvite`, `account.firstLink`, `account.resetLink`, `organisation.connect`, `organisation.key`, `site.register`, `site.unregister`, `remoteAccess.on`, `remoteAccess.off`, `remoteAccess.csr`, `remoteAccess.authenticator.add` (plus `backup.location.set`, `upgrades.set`, `resize.*`, handled in domains 8, 10, 15); the enrolment code file (deleted once spent, never logged); Cloud's own link and its envelopes
- **Note:** A Cloud-only operation is refused from the Fleet Console, the CLI and any machine not enrolled. The `HQ_RUN_BY_CLOUD` settings are written in domain 4.

### 19. Status, figures, logs, front door & previews
- **Files:** `src/status/machineStatus.ts`; `src/status/portsBlocked.ts`; `src/status/siteControl.ts`; `src/figures/figures.ts`; `src/figures/mount.ts`; `src/figures/socket.ts`; `src/cli/statusText.ts`; `src/frontDoor/config.ts`; `src/frontDoor/frontDoor.ts`; `src/frontDoor/given.ts`; `src/frontDoor/probes.ts`; `src/frontDoor/set.ts`; `src/cli/frontDoorText.ts`; `src/previews/previewChecks.ts`; `src/previews/previewProbes.ts`; `src/previews/previewsSet.ts`; `src/scheduled/notices.ts`; `src/scheduled/registry.ts`; `src/scheduled/scheduler.ts`; `src/scheduled/store.ts`; `src/scheduled/time.ts`; `src/scheduled/words.ts`; `src/cli/scheduled.ts`
- **Ops:** `agenthix status`, `agenthix logs` (`hq logs`, `site logs`), `agenthix front-door` (`show`, `on`, `off`), `agenthix schedule`, `agenthix scheduled`, `agenthix hq|site schedule` change and cancel; owner-socket and controller `figures.read`, `logs.read`, `machine.status`, `frontDoor.check`, `frontDoor.set`, `previews.set`, `schedule`, `schedule.change`, `schedule.cancel`, `scheduled.list`; the figures socket (`figures.read` only) in the figures volume; background jobs: the scheduler, the ports-blocked report after start
- **Note:** The domain is wide but its files are small. A front door certificate is accepted from Cloud alone (`frontDoor/set.ts`). The figures socket is the one place the site reads the host service; confirm it answers nothing else.

### 20. Build & image
- **Files:** `docker/Dockerfile`; `scripts/build.mjs`; `scripts/check-bundles.mjs`; `package.json`; `tsconfig.json`
- **Ops:** `npm run build`, `npm run check:bundles`; the image's build stages (cosign copied in, Node and Alpine at pinned digests), entry points (`dist/main`, `dist/launcher.js`, `dist/bin/` CLI), the user the image runs as, what the image carries (`nft`, `docker` CLI with compose, `cosign`)
- **Note:** `check-bundles.mjs` is what keeps `hq/` and `site/` out of the bundles. Only the build files are here; behaviour is in the other domains.

---

## Excluded from all domains (no behaviour of their own)

`package-lock.json` (generated lockfile); `.gitignore`; `vitest.config.ts` and `vitest.container.config.ts` (test runner configuration); `AGENTS.md` (module guide, documentation); all `*.test.ts` and `*.container.test.ts` files; test support used only by tests: `src/__tests__/` (`containerGuard.ts`, `containerSubnets.ts`, `fakeMachine.ts`, `standInCloud.ts`), `src/backups/__tests__/`, `src/frontDoor/__tests__/`, `src/launcher/__tests__/`, `src/link/__tests__/`, `src/move/__tests__/`, `src/protections/__tests__/`. Build output (`dist/`) and `node_modules/` do not exist in the source.
