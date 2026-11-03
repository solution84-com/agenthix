---
name: Domain map — console
description: Feature-domain carving of the console module (the Fleet Console's server) for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Written 2026-11-03 from the routes under src/http/, the signed commands in core and the module's folders. Update only when the route or command set changes.
updated: 2026-11-03
---

# Domain map — `console/`

7 domains. The Fleet Console's server is a plain Express 5 and `ws` server with about 55 source files, so the domains follow its features and its security concerns, and each security concern is in exactly one domain: the loopback guard, the remote-access port and sessions are domain 1; the dial-out to hq is domain 2; command signing and the keys are domain 3. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness.

The screens are `console-web/` and have their own map ([`console-web.md`](console-web.md)); domains 1 to 7 here and there share names, so one agent can be given both halves of a feature.

**Ownership is by concern.** The server holds no database. It keeps state in its folder (pinned machines, its keys, sessions as hashes, moves, joins) and asks hq through its link. An operation belongs to the domain whose rule it enforces; the signed command set is core's `HostRequest`, checked by `parseHostRequest` before anything is sent.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Access, network & remote access | Session, listen address, remote access | the loopback and container-gateway guard, Host/origin/CSRF/CSP rules, sign-in with hq, sessions, the fleet admin role check, fleet admin list, remote access port, TLS, allow-list, authenticator code |
| 2 | Process start, hq link, activity & notices | hq link, credential, activity, notices | start-up and configuration, the control socket and command line, the dial-out to hq and its credential, hq's address, hq facts and features, the activity record, notices |
| 3 | Fleet & signed host commands | PinnedHost, console keys, HostMessage | the fleet list, a machine's page, signed and sealed commands and their answers, replay checks, figures, logs, presence, silence, disconnecting, the notify setting |
| 4 | Joining & adding sites | Join, PinnedHost (at join) | the one-time code, the binding, join requests, confirm and refuse, the site's name, install on a joined machine, restoring a site on a new machine |
| 5 | Moves & handover | Move, handover certificate | *Move site…*, *Move HQ…*, the `hqMachine` mark, handing the Fleet Console to another machine, following a handover |
| 6 | Backups, restore & exports | Backup night, Export | listing a machine's nights, restoring or scheduling a restore, one-time export download links and the streamed file |
| 7 | Cloud & live previews | Cloud connection, platform offers, LivePreview settings | the Cloud section as read through hq, Cloud's offers and keys, a site's live previews and their limits |

---

## Domain scopes (files + operations)

### 1. Access, network & remote access
- **Files:** `src/http/guards.ts`; `src/http/app.ts`; `src/http/web.ts`; `src/http/routes/session.ts`; `src/http/routes/remoteSignIn.ts`; `src/http/routes/fleetAdmins.ts`; `src/http/routes/cloud.ts` (the `/remote-access` and `/authenticator` routes; its `/cloud` routes are domain 7's); `src/auth/signIn.ts`; `src/auth/sessions.ts`; `src/auth/roleCheck.ts`; `src/auth/authenticators.ts`; `src/auth/totp.ts`; `src/net/allowList.ts`; `src/net/containerNetwork.ts`; `src/net/csr.ts`; `src/net/der.ts`; `src/net/remoteAccess.ts`; `src/net/remoteListener.ts`
- **Ops:** GET `/api/status`, POST/GET/DELETE `/api/session`, GET `/api/sign-in/remote`, the remote-access sign-in path of POST `/api/session`; GET `/api/fleet-admins`, GET `/api/fleet-admins/find`, POST `/api/fleet-admins`, DELETE `/api/fleet-admins/:userId`; GET/POST `/api/remote-access`, DELETE `/api/remote-access` (not connected answer), GET/POST `/api/authenticator`, POST `/api/authenticator/check`, POST `/api/authenticator/recovery-codes`; the screens' static files and index fallback served behind the same guards; the CLI's `remote-csr`, `remote-on`, `remote-off`, `remote-status` and `remote-authenticator-add` handled here (`src/net/remoteAccess.ts`)
- **Note:** security-sensitive. The guards (peer, Host, origin, JSON, cookie plus CSRF token, CSP, `no-store`), the container listen address and gateway rule, the remote-access listener (TLS with its own key, allow-listed addresses, authenticator code, `Secure` cookie) and the fleet admin role check against hq are all here. `listen` itself is in `src/console.ts` (domain 2), which must be read for the listen-address refusal. The one-time export link is a deliberate exception to the CSRF rule and is domain 6's.

### 2. Process start, hq link, activity & notices
- **Files:** `src/main.ts`; `src/console.ts`; `src/config.ts`; `src/cli.ts`; `src/control/client.ts`; `src/control/socket.ts`; `src/control/hqReach.ts`; `src/hq/link.ts`; `src/hq/wsLink.ts`; `src/hq/credentials.ts`; `src/hq/addressFollow.ts`; `src/hq/addressPolicy.ts`; `src/hq/hqFacts.ts`; `src/hq/hqFeatures.ts`; `src/state/folder.ts`; `src/activity.ts`; `src/http/routes/activity.ts`; `src/http/routes/noticeTarget.ts`; `src/http/routes/newerHq.ts`; `src/http/routes/features.ts`; `scripts/build.mjs`; `docker/Dockerfile`; `package.json`; `package-lock.json`; `tsconfig.json`; `vitest.config.ts`; `.gitignore`
- **Ops:** GET `/api/activity`, GET `/api/notices`, POST `/api/notices/:id/dismiss`, GET `/api/features`; the link to hq's `/console-link` (dial-out, reconnect, credential presented and kept, address follow); the control socket and the CLI's `local-join`, `handover-code`, `handover-status` entry points (their rules are domain 5's and 4's); `activity.record` to hq
- **Note:** security-sensitive. The dial-out to hq, the pairing secret and one-time code kinds, the lasting credential, the https-or-private-address rule and the control socket (Unix socket in the state folder, mode 0600) are here. The environment table in `AGENTS.md` is this domain's contract.

### 3. Fleet & signed host commands
- **Files:** `src/hosts/commands.ts`; `src/hosts/disconnect.ts`; `src/hosts/figuresRefresh.ts`; `src/hosts/presence.ts`; `src/hosts/silence.ts`; `src/http/commandRuns.ts`; `src/http/routes/commands.ts`; `src/http/routes/fleet.ts`; `src/state/keys.ts`; `src/state/hosts.ts`; `src/state/disconnected.ts`
- **Ops:** GET `/api/fleet`, GET `/api/hosts/:fingerprint`, POST `/api/hosts/:fingerprint/disconnect`, PUT `/api/hosts/:fingerprint/notify`, DELETE `/api/fleet/disconnected/:id`; POST `/api/hosts/:fingerprint/commands`, GET `/api/hosts/:fingerprint/figures`, GET `/api/hosts/:fingerprint/logs`, GET `/api/commands/:id`; every `HostRequest` op sent through `HostCommands` (install, upgrade, backup.*, erase, start, stop, remove, suspend, resume, frontDoor.set, address.set and the rest of core's closed set); `host.silenceFacts` to hq
- **Note:** security-sensitive. Signing with the console's key, sealing to a host's pinned identity, opening an answer only against the pinned host asked, replay checks, `parseHostRequest` and the refusal of `backup.restore` through the command route live here, and the key files in `src/state/keys.ts`. The machine that carries hq (`hqMachine`) cannot be disconnected.

### 4. Joining & adding sites
- **Files:** `src/join/joins.ts`; `src/join/installSite.ts`; `src/join/names.ts`; `src/join/restoreSite.ts`; `src/join/view.ts`; `src/http/routes/joins.ts`
- **Ops:** POST `/api/joins`, GET `/api/joins/:joinId`, POST `/api/joins/:joinId/confirm`, POST `/api/joins/:joinId/refuse`, DELETE `/api/joins/:joinId`; the CLI's `local-join` code (10 minutes) and its self-confirmation
- **Note:** a joining machine is accepted only with a binding that needs the one-time code, and the code never reaches hq; a name is a label only and a duplicate name is turned away. `joins.ts` is over 400 lines.

### 5. Moves & handover
- **Files:** `src/move/moves.ts`; `src/move/target.ts`; `src/move/types.ts`; `src/handover/incoming.ts`; `src/handover/outgoing.ts`; `src/http/routes/moves.ts`
- **Ops:** POST `/api/hosts/:fingerprint/move`, POST `/api/hq/move`, GET `/api/moves`, GET `/api/moves/:moveId`, DELETE `/api/moves/:moveId`, POST `/api/moves/:moveId/finish`; the CLI's `handover-code` and `handover-status`; `console.handoverAck` to hq; the sealed `tookOver` word
- **Note:** security-sensitive. A machine follows only a handover certificate signed by the Fleet Console it pins, and the `hqMachine` mark moves only on the new machine's sealed word, never on anything hq says.

### 6. Backups, restore & exports
- **Files:** `src/http/routes/backups.ts`; `src/http/routes/exports.ts`; `src/exports/downloads.ts`
- **Ops:** GET `/api/hosts/:fingerprint/backups`, POST `/api/hosts/:fingerprint/restore`, POST `/api/hosts/:fingerprint/exports/:exportId/download`, GET `/api/export-downloads/:downloadId`, GET `/api/export-downloads/file/:link`; `backup.list`, `backup.exportRead` and restore commands
- **Note:** the download link is one-time, a minute long and tied to the session's cookie, and rechecks the fleet admin role with hq. A key for a copy in the backup location passes sealed and is never kept.

### 7. Cloud & live previews
- **Files:** `src/http/routes/cloud.ts` (the `/cloud` routes; the remote-access and authenticator routes are domain 1's); `src/http/routes/cloudPlatform.ts`; `src/http/routes/livePreviews.ts`
- **Ops:** GET `/api/cloud`, POST/DELETE `/api/cloud/account/sign-in`, DELETE `/api/cloud/account`, GET `/api/cloud/sites`, GET `/api/cloud/fleet-admins`, GET `/api/cloud/asks`, GET `/api/cloud/offers`, POST `/api/cloud/offers/:offer/dismiss`; GET/PUT `/api/sites/:fingerprint/live-previews`, DELETE `/api/sites/:fingerprint/live-previews/:livePreviewId`
- **Note:** the Cloud connection itself is hq's; these routes only read and relay it. The live preview routes are behind the `livePreview` flag at its experimental stage.

---

## Excluded from all domains

- Tests and test support: everything under `src/__tests__/`, `*.test.ts`, and `src/test/` (`experimental-failures-setup.ts`, `noProviderCalls.ts`, `provider-guard-setup.ts`).
- `node_modules/`, `dist/`, and `.agents/` (module skills).
- `AGENTS.md` and `CLAUDE.md`, the module's rules, not source.
- Generated and untracked files: none were found beyond the lock file, which sits with domain 2's build files.
