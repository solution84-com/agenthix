# relay — the fleet's door for files

Read the repository's [`AGENTS.md`](../AGENTS.md) first; this file adds what applies to work in `relay/`.

A relay carries every byte of a file a browser opens, from the site that holds it to the browser
([adr-0153](../docs/adr/adr-0153-relays-carry-every-file-byte-and-hq-only-signs-tickets.md)). Sites dial out to it and hold a line; browsers
fetch `GET`/`HEAD /t/<ticket>` on the files address (or `/relay/t/<ticket>` on hq's own address, where there is no
files address); the relay passes one to the other. hq's relay also serves the files hq keeps itself (task attachments,
pictures) from hq's storage folder, mounted read-only. hq's relay runs in hq's
compose set, reached through hq-web; a further relay runs on a machine of its own, never beside a site
([adr-0154](../docs/adr/adr-0154-a-machine-carries-a-site-or-a-relay-never-both-outside-hqs.md)). The design is part 1 and part 6 of the
unit that built it, under `docs/work/`.

**What a relay never does:** decide who may read what, make a ticket or a pass, write or store a file, hold a
database, or keep anything beyond its lines and its counters. A site's ticket it passes on unverified (the site
verifies it); an upload's ticket names the relay as its audience, so the relay verifies that one itself with core's
verifier, exactly as a site would, and reads only a path core's upload patterns accept. It never logs a ticket, a
path, a query string or any request header: a ticket travels in the path.

## A plain Node server

`node:http` and `ws`, with `@agenthix/core` bundled (as in `console/`). Nothing here imports from `hq/`, `site/`,
`host/` or `console/`.

- `src/main.ts` reads the environment (`src/config.ts`), starts the hq link and listens.
- `src/relay.ts` puts the server together; the tests give it hq's keys directly and no hq link.
- `src/lines/`: where sites dial (`RELAY_SITE_LINE_PATH`). A line is kept only for a pass hq signed (RS256, checked
  by core's `verifyRelayToken`) naming this relay as audience and the dialling site as subject. One line per site:
  a new dial takes new streams and the old line closes once its streams finish. On a line the relay is the content
  multiplexer's opener (`StreamMux('opener')`), the site its server.
- `src/hq/hqLink.ts`: dials hq's `RELAY_HQ_LINK_PATH` with the shared secret; hq's `relay.welcome` names the relay
  (the audience its passes must carry); it reports its load every `RELAY_REPORT_INTERVAL_MS`; it reconnects with
  backoff.
- `src/keySet.ts`: hq's public keys from `HQ_JWKS_PATH`, refetched for an unknown key id at most every 30 s.
- `src/http/door.ts`: which door a request came by. `/t/<ticket>` on the files host, or core's bare prefix
  (`/relay/t/<ticket>`) on the app's host, which hq-web passes through unchanged. The bare door is hq's origin, so
  core's `relayAnswerForm` rule for it applies: every answer an attachment, a picture keeps its type, any other preview
  is plain text, and a preview of a kind that needs a files address (a PDF) is refused.
- `/health` answers `ok` on any host, for the start test and compose.
- `src/uploads/`: hq's uploads. An `upload` ticket (core's `readTicketRoute` says `servedBy: 'relay'`) is verified
  with core's `verifyRelayToken` for this relay's id and the `upload` space only, then the file is opened from
  `HQ_UPLOADS_ROOT`: task attachments under `tasks/`, every other upload path as it reads; the last part opened with
  `O_NOFOLLOW`, its real path required to be exactly the path asked for (no link anywhere on the way), the open
  descriptor checked to be the entry at that path, and a file with another hard link refused. The version is checked
  against the open file, as a site checks it. Tickets without a person (pictures shown before sign-in) share one
  stream count.
- `src/http/`: a browser's request for a site's file. Cookies and authorisation dropped; the ticket's `site`
  and `person` read unverified to choose the line and count streams (16 per person, then 429); `files.serve` opened
  with the ticket and the raw `Range`; the site's head turned into the status and headers; the bytes passed on. Every
  answer, refusals included, carries `Content-Security-Policy: sandbox`, `nosniff`, `no-referrer`, and CORS for the
  app's origin only, never with credentials. A download is an attachment and an octet stream.
- `src/viewer/` and `viewer/pdf/`: the PDF viewer page (spec part 2), `GET`/`HEAD /viewer/pdf` and its files under
  `/viewer/pdf/`, on the files host only and only when the relay knows hq's origin. `viewer/pdf/` is browser code:
  pdf.js's display API draws pages onto canvases, reading the file by range from the ticket path given in the page's
  address fragment (never a query string, never an origin), through its own range transport
  (`viewer/pdf/ticketSource.ts`), and reports to hq's page by `postMessage`, to hq's origin only. When hq renews the
  file's tickets it sends the new ticket's path by `postMessage` (`pdf-viewer-host`); the page takes it only from its
  parent, from hq's origin, and only a `/t/` ticket path, and reads on with it without reopening the document.
  It never uses pdf.js's viewer component, scripting manager or sandbox, so a PDF's script has nothing to run it; XFA is off. Its answers carry their own policy in place of `sandbox`: script, style, connections and workers
  from its own origin only, no eval (pdf.js's worker alone may compile WebAssembly, for its image decoders), framed
  only by hq's origin, no forms, no base. The files are read into memory at start from `dist/viewer/pdf` and served by
  exact name, never by joining a path. A relay built without them answers the page 404 in words.
- `npm run build` bundles `dist/relay.js` with esbuild, and the viewer into `dist/viewer/pdf` (pdf.js, pinned, bundled
  in; its worker, fonts, character maps and image decoders copied beside it; ui's design tokens ahead of its style).
  `npm run typecheck` checks the server and the viewer, and needs `core/` built first.
- The image is `docker/Dockerfile`, built from the repository root.

Its environment:

| Variable | What it is |
|---|---|
| `RELAY_HQ_ADDRESS` | Where it dials hq. https, or plain http only to this machine, a private address or a container name. Required |
| `HQ_RELAY_SECRET` | The secret it shares with hq, at least 32 characters. Required, never logged |
| `HQ_URL` | hq's public address: the one origin given CORS. `RELAY_HQ_ADDRESS` when unset |
| `FILES_ORIGIN` | The files address it answers browsers on; unset, `files.localhost` when hq is on localhost, else none (as hq-web decides) |
| `RELAY_PORT` | Its port; the relay's server port by default ([`docs/architecture/ports.md`](../docs/architecture/ports.md)) |
| `RELAY_LISTEN_HOST` | `127.0.0.1` by default; `0.0.0.0` in its image |
| `HQ_UPLOADS_ROOT` | hq's relay only: hq's storage folder (hq's `HQ_STORAGE_ROOT`), mounted read-only. Unset or not a folder: the relay starts, says plainly that it does not serve uploads, and answers an upload's ticket 503 |

## Testing

`npm test` runs the unit tests: the server on 127.0.0.1 with fake sites on real lines and hq's keys made in the
test, including a ranged download end to end; uploads against a temporary storage folder with planted links; the viewer's
route and policy, its address and options, and a PDF that carries JavaScript (`viewer/pdf/__tests__/fixtures/`) against
the viewer's bundle. No Docker. A browser test opens that fixture in the frame.
