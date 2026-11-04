# console — the Fleet Console

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `console/`.

The Fleet Console is the fleet admins' portal (host-management spec §7): a site of its own kind that dials out to hq
like every site, runs no agents and has no authority of its own — everything it does, a host service does, asked
through signed commands that hq relays unread. It has no accounts: people sign in with their hq login, and only an
account holding the fleet admin role gets in. It runs as the image `agenthix-console`, on hq's machine by default,
started by the host service.

This module is its server and its JSON API under `/api/`. The screens are their own package, `console-web/`
([`console-web/AGENTS.md`](../console-web/AGENTS.md)); this server serves their build (`src/http/web.ts`), behind the
same guards as the API. Nothing here depends on React, Vite or Tailwind, and the tests serve a fixture directory, so
they never need the web build.

## A plain Node server, like the site

Express 5 and `ws`, and `@agenthix/core` bundled (ADR-0086's reasons apply). Nothing here imports from `hq/`,
`site/` or `host/`.

- `src/main.ts` reads the environment (`src/config.ts`), opens the link to hq and listens.
- `src/console.ts` puts the parts together around a link; the tests give it a fake one (`src/__tests__/fakes.ts`).
- `src/cli.ts` is the image's command line, run by the host service with `docker exec`. It reaches the running
  server through the control socket (`src/control/`), `control.sock` in the state folder, mode 0600, and each
  command prints one JSON line:
  - `local-join` → `{"code":"…"}`: a one-time code, 10 minutes, for joining hq's own machine at install. That
    join, and only that one, confirms itself when a request whose binding proves its code arrives; it installs
    nothing, since hq's default site already runs, and is recorded as done by the machine. The machine it pins is
    marked as the one that carries hq (`hqMachine`).
  - `handover-code` → `{"code":"…","expiresAt":"…"}`: a one-time code, 1 hour, to move this Fleet Console to
    another machine (`src/handover/outgoing.ts`).
  - `handover-status` → `{"state":"…", …}`: whether this Fleet Console took another's place, and how many machines
    follow it so far (`src/handover/incoming.ts`).
  - `hq-address <address>` → `{"address":"…","outcome":"…"}`: hq moved; the Fleet Console dials the new address once it
    passes the check (`src/hq/addressFollow.ts`).
  - `remote-csr`, `remote-on`, `remote-off`, `remote-status`, `remote-authenticator-add` and `remote-authenticator-reset`: remote access on a machine
    Agenthix Cloud runs, asked by the host service for Cloud (`src/net/remoteAccess.ts`). The request is a JSON
    payload on standard input, so an authenticator's secret is never in a command line.
- `npm run build` bundles the server to `dist/console.js` and the command line to `dist/cli.js` with esbuild.
  `npm run typecheck` needs nothing generated first, but `core/` must be built (`cd core && npm run build`).
- The image is `docker/Dockerfile`, built from the repository root with only Docker (ADR-0069).

Its environment, set by the host service:

| Variable | What it is |
|---|---|
| `CONSOLE_HQ_ADDRESS` | hq's address. https, or plain http only to the machine itself or a private network |
| `HQ_CONSOLE_PAIRING_SECRET` | On hq's machine: the pairing secret set at install. A lasting credential, once held, is presented instead |
| `CONSOLE_HQ_CODE` | Elsewhere: the one-time code from `agenthix hq console-code`. Only its lookup is presented to hq, once, for a lasting credential. Its first character says its kind: `H` for one hq made (the Fleet Console starts with no machines), anything else for a handover code from the running Fleet Console |
| `CONSOLE_VERSION` | The version it runs, set when the host service starts the container; `dev` when it is not set (a development build) |
| `CONSOLE_MACHINE_NAME` | The machine's name, for the words people read |
| `CONSOLE_STATE_DIR` | The state folder, `/state` by default |
| `CONSOLE_PORT` | The Fleet Console's server port by default, inside its container and in dev ([`docs/architecture/ports.md`](../docs/architecture/ports.md)) |
| `CONSOLE_LISTEN_HOST` | `127.0.0.1` by default, as in `npm run dev` on a machine. `container` in its container: it listens on its own network's address and accepts that network's gateway (below). Nothing else is accepted |
| `CLOUD_URL` | Optional: Agenthix Cloud's address, for the links out of the Cloud section. Cloud's own address when it is not set. The connection itself is hq's (`docs/architecture/cloud-connection.md`) |
| `CONSOLE_WEB_DIR` | The built screens' directory. By default `web/` beside the bundle's folder: `/app/web` in the image, where the build stage copies `console-web/dist`. Without a build there, the server answers the API alone |

## Rules that keep it closed

- **It is reached on its machine's 127.0.0.1 only**, with one exception: on a machine Agenthix Cloud runs, while Cloud
  has remote access on, it also listens on the one port the host service publishes, ends TLS there with its own key,
  answers only the addresses Cloud allows, and every session there needs a fleet admin's hq sign-in and an
  authenticator code (`src/net/remoteAccess.ts`, ADR-0132). Outside a container it listens on 127.0.0.1. In its container
  (`CONSOLE_LISTEN_HOST=container`) it runs on a Docker network of its own, which nothing else joins, and Docker
  publishes its port to the machine's 127.0.0.1 only; it listens on its address on that network — never on every
  address — and accepts a connection only from that network's gateway, through which Docker forwards the published
  port. The address and the gateway are read inside the container at start (`src/net/containerNetwork.ts`: the
  default route in `/proc/net/route`, and the interfaces), never from a request or from hq; it does not start
  when its route out is a network hq is on (hq's link network, on hq's machine) or when the route is not clear.
  Its compose project sets `rp_filter`, so a packet claiming the gateway as its source is taken only on its own
  network. `listen` (`src/console.ts`) refuses any other address, and checks where it ended up. Nothing dials it:
  it only dials out, to hq. The control socket is a Unix socket inside the container, never a network port.
- **Every request passes `src/http/guards.ts`**, the screens' files included: the peer is the loopback, or in its
  container its network's gateway arriving on its own address there (`peerAllowed`), the Host
  header names the loopback (DNS rebinding), no other origin or site, JSON for anything that changes state, and a
  session needs its HTTP-only, same-site strict cookie and its CSRF token header together. The content security
  policy allows scripts, styles, fonts, images and requests from this origin only — nothing inline, no other
  origin, never in a frame — and every answer is `no-store` but the hashed files under `/assets/`. Cookies are not
  kept apart by port, so the token, returned only at sign-in, is what keeps a cookie seen by another server on
  127.0.0.1 from opening a session. The screens keep the token in the tab's `sessionStorage`, and a new tab is handed
  it by a signed-in one over a `BroadcastChannel` (`console-web/src/api/tokenShare.ts`): it asks, an open tab answers
  that ask with the token alone, and the new tab checks the session with the server before it opens anything. A
  channel reaches only pages of the same origin — scheme, host and port — so a page on another port of 127.0.0.1,
  sent the same cookie, cannot hear it; the token is never written to `localStorage`, a cookie or an address.
  Signing out in one tab tells the others to drop it, and the session still ends after an hour unused. A request that
  came through remote access (`remoteNameOf`) is held to its own rule instead of the loopback's: its Host header is
  the name Cloud chose, its origin that name over https, its cookie `Secure`, and its session one opened through remote
  access, which works nowhere else.
  **One exception, for downloading an export:** a file the browser fetches itself cannot send the CSRF header, so the
  screen first asks, with its session and token, for a one-time link (`POST /api/hosts/:fp/exports/:id/download`) that
  lasts a minute, works once, is tied to that session's cookie, and checks the fleet admin role with hq again. The
  cookie alone still opens nothing. The export's chunks come as answers to `backup.exportRead`, each signed by the
  machine and sealed to this Fleet Console, so hq sees only their sizes; nothing of the file is kept here.
- **hq is not trusted with what the cryptography protects.** Commands are `HostMessage` requests signed with the
  console's key and sealed to a host's pinned identity (`src/hosts/commands.ts`); an envelope that comes back is
  opened only against a pinned host, checked against replay, and counts only as an answer from the host the
  request went to, for the operation asked. Anything else is dropped. A joining machine is accepted only with a
  binding that needs the one-time code, and the code itself never reaches hq — only its lookup
  (`src/join/joins.ts`).
- **Moving the Fleet Console: a machine follows only a handover certificate signed by the Fleet Console it pins; the
  code never reaches hq.** The running Fleet Console makes the code on its own machine (`handover-code`) or — when
  it runs elsewhere — for hq's machine alone, which asks in an envelope its host service signs and seals, and gets
  the code back sealed to it (`src/handover/outgoing.ts`). Which pinned machine carries hq is known only from the
  local join at install, the sealed handover, a move of hq this Fleet Console finished, and a fleet admin's
  confirmation of a join that says "this machine runs HQ" under its binding while no machine holds the mark — never
  from hq. It answers a new Fleet Console only for a binding
  that needs the code, with a certificate naming the new identity and its machines sealed to it. The new one takes
  them only from the Fleet Console that made the code, only with a handover code (a code hq made, hq knows, so an
  answer that proves it proves nothing), and pins them only once it keeps its credential: hq retires the running
  one when the new one acknowledges that credential (`console.handoverAck`), or presents it after a dropped
  connection. A credential hq gives for a handover code before any machines came is refused: the move did not
  happen, and the Fleet Console does not start empty.
- **Moves.** *Move site…* and *Move HQ…* are `src/move/moves.ts`, with the routes `POST /api/hosts/:fp/move`,
  `POST /api/hq/move`, `GET /api/moves[/:id]`, `DELETE /api/moves/:id` and `POST /api/moves/:id/finish`. A move ends
  only on the sealed word of its own two machines — or, while it still waits for the new machine, by itself when
  that machine's code expires or is refused: nothing was asked of either machine yet, so the site stays where it was.
  The new machine may instead be one already connected here that runs no site, named with `to` on
  `POST /api/hosts/:fp/move` (`Moves.startTo`, `src/move/target.ts`): no code, the move is set up at once. A move's new
  machine is pinned with no site name until the move finishes; when a move ends without happening, it stays connected
  with none, and `GET /api/fleet` gives it `endedMove`, so a site is never listed on two machines. *Move HQ…* starts only from the machine marked `hqMachine`, and
  the mark moves (`PinnedHosts.markHqMachine`) only when this Fleet Console finishes a move of hq it recorded itself,
  on the new machine's sealed `tookOver` — never on anything hq says. A move of hq is written down as under way
  before hq's machine is asked, since a Fleet Console beside hq is restored from hq's backup on the new machine.
- **A site is called by its machine's name** (`src/join/names.ts`), here, in hq and on the machine: no name is asked
  at *Add a site*, and a move or restore gives the site its new machine's name (`PinnedHost.siteName` follows
  `machineName`; hq renames its record itself). A name is a label only — never used to find, match or trust a
  machine — but a machine whose name is already a pinned machine's (letter case aside) is turned away at its join,
  in words that name the other; a move's old machine and a restore's lost one don't count, since they leave.
- **Disconnecting.** The machine that carries hq (`hqMachine`) cannot be disconnected: hq moves first. Nor can a machine in a move under way, until the move ends. A machine
  disconnected here stays listed (who, when, its names; no keys) until a fleet admin removes it from the list or adds
  it again.
- **A machine that stops answering.** Each pinned machine has `notifyIfSilent` (absent is yes), asked with the code
  on `POST /api/joins` and `POST /api/hosts/:fp/move` (`notify`), changed with `PUT /api/hosts/:fp/notify` and
  recorded, and carried across a move of the Fleet Console. hq's machine is never asked and always notified; *Move
  HQ…* does not ask either (`Moves.open` takes `notify`, unused for hq), since the new machine becomes hq's. A host
  service's sealed stop word (`stopping`) is accepted only from that pinned machine and is never consent to anything:
  it makes the card read "Stopped on its machine" until the machine answers again on a new connection. The one
  notice is hq's own *not heard from* (10 minutes, to fleet admins), so `src/hosts/silence.ts` sends no notice: it
  tells hq the two facts per machine — the setting and the stop — with `host.silenceFacts`, a notification
  preference that gives hq no authority. Nothing is ever done to a machine either way.
- **The API carries only the closed set**: a command is checked with core's `parseHostRequest` before it is sent.
- **Restoring a night** is `src/http/routes/backups.ts`: `GET /api/hosts/:fp/backups` answers the machine's sealed
  `backup.list`, and `POST /api/hosts/:fp/restore` takes the machine's name typed to confirm, finds the night in the
  machine's own list, restores it now or schedules it, and records it with that night. The command route refuses
  `backup.restore`, so a restore goes only this way. A key for a copy in the backup location passes sealed to the
  machine and is never recorded or kept.
- **Every action goes to hq's `activity.record`** (`src/activity.ts`); adding and disconnecting a site, exports and
  erases are announced (hq announces a grant of the role itself). No key, code, credential or password is ever
  logged, recorded or written anywhere but the state folder, which is readable by its owner only; sessions are kept
  there as hashes.

## Testing

`npm test` runs the unit tests: the server on 127.0.0.1 with a fake hq link and fake host services that hold real
keys. Its compose project against a real Docker — reached at 127.0.0.1, refused on hq's link network and by any
other peer on its own — is `host/src/compose/__tests__/console.container.test.ts`, with the image built.
